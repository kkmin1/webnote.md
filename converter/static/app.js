const docxForm = document.getElementById("docx-form");
const mdForm = document.getElementById("md-form");
const docxFiles = document.getElementById("docx-files");
const mdFiles = document.getElementById("md-files");
const docxSelected = document.getElementById("docx-selected");
const mdSelected = document.getElementById("md-selected");
const docxStatus = document.getElementById("docx-status");
const mdStatus = document.getElementById("md-status");
const docxResults = document.getElementById("docx-results");
const mdResults = document.getElementById("md-results");
const template = document.getElementById("result-card-template");

function setStatus(node, kind, message) {
  node.hidden = !message;
  node.className = `status ${kind}`;
  node.textContent = message || "";
}

function clearResults(node) {
  node.innerHTML = "";
}

function appendResult(node, item, showPreview) {
  const fragment = template.content.cloneNode(true);
  fragment.querySelector(".result-title").textContent = item.output_name;

  const button = fragment.querySelector(".download-link");
  button.dataset.url = item.download_url;
  button.dataset.filename = item.output_name;
  button.textContent = "파일 저장";

  if (showPreview && item.preview) {
    const preview = fragment.querySelector(".preview");
    preview.hidden = false;
    preview.textContent = item.preview;
  }

  node.appendChild(fragment);
}

function updateSelectedFiles(input, container, label) {
  const files = Array.from(input.files || []);
  if (!files.length) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;
  const names = files.map((file) => file.name).join("<br>");
  container.innerHTML = `<strong>${label}</strong>${names}`;
}

async function saveWithPicker(url, filename) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("파일을 가져오지 못했습니다.");
  }

  const blob = await response.blob();
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const tempUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = tempUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(tempUrl);
}

async function submitForm(form, url, statusNode, resultsNode, showPreview) {
  setStatus(statusNode, "info", "변환 중입니다...");
  clearResults(resultsNode);

  try {
    const response = await fetch(url, {
      method: "POST",
      body: new FormData(form),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "변환에 실패했습니다.");
    }

    data.items.forEach((item) => appendResult(resultsNode, item, showPreview));

    if (data.archive_url) {
      const archiveItem = {
        input_name: "batch",
        output_name: "전체 결과 ZIP",
        download_url: data.archive_url,
      };
      appendResult(resultsNode, archiveItem, false);
    }

    setStatus(statusNode, "info", `완료되었습니다. ${data.items.length}개 결과를 준비했습니다.`);
  } catch (error) {
    setStatus(statusNode, "error", error.message);
  }
}

docxFiles.addEventListener("change", () => {
  updateSelectedFiles(docxFiles, docxSelected, "선택된 DOCX 파일");
});

mdFiles.addEventListener("change", () => {
  updateSelectedFiles(mdFiles, mdSelected, "선택된 Markdown 파일");
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest(".download-link");
  if (!button) {
    return;
  }

  try {
    await saveWithPicker(button.dataset.url, button.dataset.filename);
  } catch (error) {
    const message = error && error.message ? error.message : "파일 저장에 실패했습니다.";
    alert(message);
  }
});

docxForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitForm(docxForm, "/api/docx-to-md", docxStatus, docxResults, true);
});

mdForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitForm(mdForm, "/api/md-to-docx", mdStatus, mdResults, false);
});
