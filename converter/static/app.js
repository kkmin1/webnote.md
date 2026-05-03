const docxForm = document.getElementById("docx-form");
const mdForm = document.getElementById("md-form");
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
  fragment.querySelector(".result-label").textContent = item.input_name;
  fragment.querySelector(".result-title").textContent = item.output_name;

  const link = fragment.querySelector(".download-link");
  link.href = item.download_url;
  link.textContent = "파일 받기";

  if (showPreview && item.preview) {
    const preview = fragment.querySelector(".preview");
    preview.hidden = false;
    preview.textContent = item.preview;
  }

  node.appendChild(fragment);
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

docxForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitForm(docxForm, "/api/docx-to-md", docxStatus, docxResults, true);
});

mdForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitForm(mdForm, "/api/md-to-docx", mdStatus, mdResults, false);
});
