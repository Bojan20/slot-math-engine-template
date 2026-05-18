//
//  AppDelegate.swift
//  Slot Math Studio (CORTI W207-MOBILE — Capacitor wrapper skeleton)
//
//  Pure-stub bootstrap; do not ship without running `npx cap add ios`
//  which will regenerate this file alongside the Xcode workspace. The
//  intent here is to give reviewers an at-a-glance view of how the
//  studio wraps the web build inside a WKWebView via Capacitor.

import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

  var window: UIWindow?

  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions:
                     [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    // Capacitor will pick the bundled web-dir (../web/studio/dist) and
    // hand the WKWebView a navigation request against
    // capacitor://localhost. The bridge is wired up implicitly when
    // the CAPBridgeViewController is instantiated by Main.storyboard.
    return true
  }

  func application(_ application: UIApplication,
                   open url: URL,
                   options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    // Allow `slotstudio://…` deep links straight into the studio.
    return ApplicationDelegateProxy.shared.application(application, open: url, options: options)
  }

  func application(_ application: UIApplication,
                   continue userActivity: NSUserActivity,
                   restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    // Continue NSUserActivity (universal links).
    return ApplicationDelegateProxy.shared.application(application,
                                                       continue: userActivity,
                                                       restorationHandler: restorationHandler)
  }
}
