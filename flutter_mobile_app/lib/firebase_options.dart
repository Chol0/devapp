// File generated manually to run on web. Replace with `flutterfire configure` for full platform support.
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return macos;
      case TargetPlatform.windows:
        return windows;
      case TargetPlatform.linux:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for linux - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyCligP6ePhaa3GP5BGMn4I0PLnrEjwDT7s',
    appId: '1:6623924421:web:admin-dashboard',
    messagingSenderId: '6623924421',
    projectId: 'product-inventory-app-fdbc7',
    authDomain: 'product-inventory-app-fdbc7.firebaseapp.com',
    storageBucket: 'product-inventory-app-fdbc7.firebasestorage.app',
    databaseURL: 'https://product-inventory-app-fdbc7-default-rtdb.firebaseio.com',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyCligP6ePhaa3GP5BGMn4I0PLnrEjwDT7s',
    appId: '1:6623924421:android:placeholder',
    messagingSenderId: '6623924421',
    projectId: 'product-inventory-app-fdbc7',
    storageBucket: 'product-inventory-app-fdbc7.firebasestorage.app',
    databaseURL: 'https://product-inventory-app-fdbc7-default-rtdb.firebaseio.com',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyCligP6ePhaa3GP5BGMn4I0PLnrEjwDT7s',
    appId: '1:6623924421:ios:placeholder',
    messagingSenderId: '6623924421',
    projectId: 'product-inventory-app-fdbc7',
    storageBucket: 'product-inventory-app-fdbc7.firebasestorage.app',
    databaseURL: 'https://product-inventory-app-fdbc7-default-rtdb.firebaseio.com',
    iosBundleId: 'com.example.flutterMobileApp',
  );

  static const FirebaseOptions macos = FirebaseOptions(
    apiKey: 'AIzaSyCligP6ePhaa3GP5BGMn4I0PLnrEjwDT7s',
    appId: '1:6623924421:macos:placeholder',
    messagingSenderId: '6623924421',
    projectId: 'product-inventory-app-fdbc7',
    storageBucket: 'product-inventory-app-fdbc7.firebasestorage.app',
    databaseURL: 'https://product-inventory-app-fdbc7-default-rtdb.firebaseio.com',
    iosBundleId: 'com.example.flutterMobileApp',
  );

  static const FirebaseOptions windows = FirebaseOptions(
    apiKey: 'AIzaSyCligP6ePhaa3GP5BGMn4I0PLnrEjwDT7s',
    appId: '1:6623924421:windows:placeholder',
    messagingSenderId: '6623924421',
    projectId: 'product-inventory-app-fdbc7',
    storageBucket: 'product-inventory-app-fdbc7.firebasestorage.app',
    databaseURL: 'https://product-inventory-app-fdbc7-default-rtdb.firebaseio.com',
  );
}
