package com.alzhefi

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager

class BoundaryAlertModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "BoundaryAlertAccess"
  @ReactMethod fun status(promise: Promise) {
    val manager = context.getSystemService(NotificationManager::class.java)
    promise.resolve(Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent())
  }
  @ReactMethod fun notificationsEnabled(promise: Promise) { promise.resolve(context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()) }
  @ReactMethod fun openSettings() {
    val action = if (Build.VERSION.SDK_INT >= 34) Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT else Settings.ACTION_APP_NOTIFICATION_SETTINGS
    val intent = Intent(action).apply {
      data = Uri.parse("package:" + context.packageName)
      putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
  }
}
class BoundaryAlertPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(BoundaryAlertModule(context), LocationTrackingModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
