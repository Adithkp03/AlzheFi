package com.alzhefi

import android.app.Activity
import android.os.Bundle
import android.os.Build
import android.content.Intent
import android.graphics.Color
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** Generic lock-screen surface. No patient identity, coordinates or auth token in the intent/UI. */
open class BoundaryAlertActivity : Activity() {
  open val isTest = false
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
    else window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(32,48,32,48); setBackgroundColor(Color.rgb(255,245,240)) }
    fun text(value: String, size: Float) = TextView(this).apply { text = value; textSize = size; setTextColor(Color.rgb(100,20,20)); gravity = Gravity.CENTER; setPadding(0,16,0,16) }
    layout.addView(text(if(isTest) "TEST ONLY - AlzheFi" else "AlzheFi boundary alert", 30f))
    layout.addView(text(if(isTest) "Diagnostic test only. No patient exit occurred. Check the test result in the app to see which path was tested." else "A boundary event needs your attention. Open the app to check the current status. This alert is not a guarantee of the patient's current position.", 20f))
    layout.addView(Button(this).apply { text = "Open AlzheFi"; setOnClickListener { startActivity(Intent(this@BoundaryAlertActivity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)); finish() } })
    layout.addView(Button(this).apply { text = "Dismiss"; setOnClickListener { finish() } })
    setContentView(layout)
    // Do not leave a stale takeover on screen indefinitely.
    window.decorView.postDelayed({ if (!isFinishing) finish() }, 60000)
  }
}

class BoundaryAlertTestActivity : BoundaryAlertActivity() { override val isTest = true }
