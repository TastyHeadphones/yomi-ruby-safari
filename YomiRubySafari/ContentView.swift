import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationStack {
            Form {
                Section("Mode") {
                    Text("Local kuromoji/IPADIC furigana mode is active.")
                        .font(.footnote)
                    Text("No API key is required.")
                        .font(.footnote)
                }

                Section("Safari") {
                    Text("Enable the extension in Settings > Safari > Extensions, then open the extension popup in Safari and tap Annotate Current Page.")
                        .font(.footnote)
                }

                Section("Notes") {
                    Text("First annotation can be slower while the tokenizer dictionary loads. If loading fails, the extension uses a small fallback dictionary.")
                        .font(.footnote)
                }
            }
            .navigationTitle("Yomi Ruby")
        }
    }
}

#Preview {
    ContentView()
}
