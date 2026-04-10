import Foundation
import SafariServices

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let responseItem = NSExtensionItem()
        responseItem.userInfo = [SFExtensionMessageKey: [
            "ok": false,
            "error": "Native messaging is disabled in local dictionary mode."
        ]]

        context.completeRequest(returningItems: [responseItem], completionHandler: nil)
    }
}
