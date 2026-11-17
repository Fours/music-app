import Capacitor
import UIKit

/** The web view's controller, with Skyloom's own plugins registered. */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AudioSessionPlugin())
    }
}
