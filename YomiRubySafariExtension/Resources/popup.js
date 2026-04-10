const browserAPI = globalThis.browser;

const annotateButton = document.getElementById("annotate-button");
const modeStatus = document.getElementById("mode-status");
const resultLabel = document.getElementById("result");

setBusy(true);
void refreshStatus().finally(() => setBusy(false));

annotateButton.addEventListener("click", async () => {
  setBusy(true);
  resultLabel.textContent = "Annotating...";

  try {
    const result = await browserAPI.runtime.sendMessage({ type: "annotateActiveTab" });

    if (!result?.ok) {
      resultLabel.textContent = result?.error || "Annotation failed.";
      return;
    }

    const base = `Processed ${result.processed} nodes, applied ${result.applied} annotations.`;
    resultLabel.textContent = result?.message ? `${base} ${result.message}` : base;
  } catch (error) {
    resultLabel.textContent = normalizeError(error);
  } finally {
    setBusy(false);
  }
});

async function refreshStatus() {
  try {
    const status = await browserAPI.runtime.sendMessage({ type: "extensionStatus" });
    modeStatus.textContent = status?.message || "Local dictionary mode is active. No API key is required.";
  } catch {
    modeStatus.textContent = "Local dictionary mode is active. No API key is required.";
  }
}

function normalizeError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unexpected extension error.";
}

function setBusy(busy) {
  annotateButton.disabled = busy;
}
