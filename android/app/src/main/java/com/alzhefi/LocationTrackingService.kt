package com.alzhefi

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.location.*
import android.os.*
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Test-host only. Native capture and upload do not need a live React runtime.
 * No coordinates persisted. Auth material encrypted with a non-exportable Android Keystore key.
 * A reboot only posts a tap-to-resume reminder. Never boot-starts location capture.
 */
object TrackingStore {
 private fun prefs(c:Context)=c.getSharedPreferences("alzhefi_tracking_v1",Context.MODE_PRIVATE)
 private fun key():SecretKey { val ks=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}; return (ks.getKey("alzhefi_tracking_v1",null) as? SecretKey)?:KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{init(KeyGenParameterSpec.Builder("alzhefi_tracking_v1",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())}.generateKey() }
 fun save(c:Context,owner:String,role:String,token:String){val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());val bytes=cipher.doFinal(JSONObject().put("owner",owner).put("role",role).put("token",token).toString().toByteArray());prefs(c).edit().putString("encrypted",Base64.encodeToString(cipher.iv+bytes,Base64.NO_WRAP)).putBoolean("enabled",true).commit()}
 fun read(c:Context):JSONObject?=try{val raw=prefs(c).getString("encrypted",null);if(raw==null)null else {val bytes=Base64.decode(raw,Base64.NO_WRAP);val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)));JSONObject(String(cipher.doFinal(bytes.copyOfRange(12,bytes.size))))}}catch(_:Exception){null}
 fun enabled(c:Context)=prefs(c).getBoolean("enabled",false)
 fun clear(c:Context){prefs(c).edit().clear().commit()}
}
class LocationTrackingService:Service(),LocationListener {
 companion object { @Volatile var epoch=0; @Volatile var running=false; @Volatile var lastFixReceived=0L; @Volatile var lastFixRecorded=0L; @Volatile var lastSent=0L; @Volatile var issue="Tracking is not running."; const val CHANNEL="native-location-sharing";const val NOTIFICATION=24011; const val RESUME=24012
 fun channel(c:Context){c.getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL,"Location sharing",NotificationManager.IMPORTANCE_LOW))}
 fun open(c:Context)=PendingIntent.getActivity(c,0,Intent(c,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 fun resumeNotice(c:Context){if(!TrackingStore.enabled(c))return;channel(c);if(android.os.Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(c,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)c.getSystemService(NotificationManager::class.java).notify(RESUME,Notification.Builder(c,CHANNEL).setSmallIcon(c.applicationInfo.icon).setContentTitle("Location sharing needs restart").setContentText("Open AlzheFi to check consent and resume tracking.").setContentIntent(open(c)).setAutoCancel(true).build())}
 }
 private val handler=Handler(Looper.getMainLooper());private val worker=Executors.newSingleThreadExecutor();@Volatile private var generation=0;private var latest:Location?=null;private var sessionStartedElapsed=0L;private var lastAttempt=0L;@Volatile private var inFlight=false;private lateinit var manager:LocationManager
 private val tick=object:Runnable{override fun run(){if(!running)return;upload();handler.postDelayed(this,30000)}}
 override fun onBind(intent:Intent?)=null
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
 if(intent?.action=="STOP"){epoch++;TrackingStore.clear(this);issue="Tracking stopped on this phone. Open AlzheFi to resume.";stopSelf();return START_NOT_STICKY}
 if(!TrackingStore.enabled(this)||TrackingStore.read(this)==null){stopSelf();return START_NOT_STICKY}
 if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){issue="Precise location permission is not granted. Open AlzheFi.";TrackingStore.clear(this);stopSelf();return START_NOT_STICKY}
 if(running){generation++;sessionStartedElapsed=SystemClock.elapsedRealtimeNanos();latest=null;lastAttempt=0;return START_STICKY}
 try{channel(this);val stop=PendingIntent.getService(this,1,Intent(this,LocationTrackingService::class.java).setAction("STOP"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 val notification=Notification.Builder(this,CHANNEL).setSmallIcon(applicationInfo.icon).setContentTitle("Location sharing is on").setContentText("Open AlzheFi to check tracking health. Tap Stop to pause on this phone.").setContentIntent(open(this)).setOngoing(true).addAction(Notification.Action.Builder(null,"Stop tracking",stop).build()).build()
 if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION) else startForeground(NOTIFICATION,notification)
 manager=getSystemService(LocationManager::class.java);sessionStartedElapsed=SystemClock.elapsedRealtimeNanos();running=true;generation++;lastFixReceived=0;lastFixRecorded=0;lastSent=0;issue="Waiting for the first native GPS fix.";lastAttempt=0
 var registered=false
 for(provider in listOf(LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER)){if(manager.allProviders.contains(provider)){manager.requestLocationUpdates(provider,30000L,0f,this,Looper.getMainLooper());registered=true}}
 if(!registered)issue="No location provider is available on this phone."
 handler.post(tick);getSystemService(NotificationManager::class.java).cancel(RESUME)
 }catch(_:Exception){running=false;issue="Native location tracking could not start. Open AlzheFi to check permissions.";stopSelf();return START_NOT_STICKY}
 return START_STICKY
 }
 override fun onLocationChanged(location:Location){if(!running||location.elapsedRealtimeNanos<sessionStartedElapsed)return;latest=Location(location);lastFixReceived=System.currentTimeMillis();lastFixRecorded=location.time;upload()}
 override fun onProviderDisabled(provider:String){issue="A location provider is off. Check phone Location settings."}
 override fun onProviderEnabled(provider:String){issue="Location provider enabled. Waiting for a fresh fix."}
 @Deprecated("Compatibility") override fun onStatusChanged(provider:String?,status:Int,extras:Bundle?){}
 private fun request(path:String,token:String,body:JSONObject?=null):Pair<Int,JSONObject?> {
 val c=URL("https://alzhefi-location-test.vercel.app/api/"+path).openConnection() as HttpURLConnection
 try{c.instanceFollowRedirects=false;c.connectTimeout=12000;c.readTimeout=12000;c.setRequestProperty("Authorization","Bearer "+token);if(body!=null){c.requestMethod="POST";c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.outputStream.use{it.write(body.toString().toByteArray())}}
 val code=c.responseCode;return Pair(code,if(code==200)c.inputStream.bufferedReader().use{JSONObject(it.readText())}else null)
 }finally{c.disconnect()}
 }
 private fun upload(){
 val now=System.currentTimeMillis();if(inFlight||now-lastAttempt<15000||!running)return
 val config=TrackingStore.read(this)?:return;val sessionGeneration=generation;val sessionEpoch=epoch;val location=latest?.let{Location(it)}
 inFlight=true;lastAttempt=now
 worker.execute{try{
 val (code,status)=request("location/status",config.getString("token"));if((sessionGeneration!=generation||sessionEpoch!=epoch))return@execute
 if(code==401||code==403){issue="Tracking authorization ended. Open AlzheFi to sign in/check sharing.";TrackingStore.clear(this);handler.post{stopSelf()};return@execute}
 if(code!=200||status==null){issue="Could not verify sharing with server. No position uploaded.";return@execute}
 val role=config.getString("role");if(status.optString("role")!=role){issue="Tracking account role changed. Open AlzheFi.";TrackingStore.clear(this);handler.post{stopSelf()};return@execute};val wanted=if(role=="patient"){val caregivers=status.optJSONArray("caregivers");caregivers!=null&&(0 until caregivers.length()).any{caregivers.getJSONObject(it).optBoolean("sharing")}}else status.optBoolean("mySharing")
 if(!wanted){issue="Tracking stopped because sharing is off.";TrackingStore.clear(this);handler.post{stopSelf()};return@execute}
 if(location==null){issue="No native GPS fix yet. Check Location settings.";return@execute}
 if(now-location.time>120000||location.time>now+30000){issue="No fresh GPS fix. Last location is not uploaded as live.";return@execute}
 if((sessionGeneration!=generation||sessionEpoch!=epoch)||!TrackingStore.enabled(this))return@execute
 val body=JSONObject().put("lat",location.latitude).put("lon",location.longitude).put("accuracyM",location.accuracy.toDouble()).put("recordedAt",location.time)
 val (sent,_)=request("location/fix",config.getString("token"),body)
 if((sessionGeneration==generation&&sessionEpoch==epoch)){if(sent==200){lastSent=System.currentTimeMillis();issue=""}else if(sent==401||sent==403){issue="Location access ended. Open AlzheFi.";TrackingStore.clear(this);handler.post{stopSelf()}}else issue="Location upload failed. Native retry is pending."}
 }catch(_:Exception){if((sessionGeneration==generation&&sessionEpoch==epoch))issue="Network/server unavailable. Native retry is pending; old fixes are not live."}finally{inFlight=false}}
 }
 override fun onDestroy(){generation++;running=false;handler.removeCallbacksAndMessages(null);if(::manager.isInitialized)try{manager.removeUpdates(this)}catch(_:Exception){};worker.shutdownNow();stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()}
}
class TrackingBootReceiver:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){if(intent.action==Intent.ACTION_BOOT_COMPLETED)LocationTrackingService.resumeNotice(context)}}
