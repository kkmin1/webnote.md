import mammoth from "https://esm.sh/mammoth@1.9.1?bundle";
import TurndownService from "https://esm.sh/turndown@7.2.0";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import DOMPurify from "https://esm.sh/dompurify@3.3.0";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "https://esm.sh/docx@9.3.0";

const statusNode = document.getElementById("status");
const docxInput = document.getElementById("docx-file");
const docxSelected = document.getElementById("docx-selected");
const markdownEditor = document.getElementById("markdown-editor");
const htmlEditor = document.getElementById("html-editor");
const htmlPreview = document.getElementById("html-preview");
const markdownPreview = document.getElementById("markdown-preview");

const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  headingStyle: "atx",
});

turndown.addRule("preserveTables", {
  filter: ["table"],
  replacement: function (_, node) {
    return `\n\n${node.outerHTML}\n\n`;
  },
});

function setStatus(kind, message) {
  if (!message) {
    statusNode.hidden = true;
    statusNode.textContent = "";
    statusNode.className = "status";
    return;
  }
  statusNode.hidden = false;
  statusNode.className = `status ${kind}`;
  statusNode.textContent = message;
}

function sanitizeHtml(input) {
  return DOMPurify.sanitize(input, {
    USE_PROFILES: { html: true },
  });
}

function renderPreviews() {
  const cleanHtml = sanitizeHtml(htmlEditor.value || "");
  htmlPreview.innerHTML = cleanHtml || "<p>HTML 미리보기가 여기에 표시됩니다.</p>";

  const renderedMarkdown = sanitizeHtml(marked.parse(markdownEditor.value || ""));
  markdownPreview.innerHTML = renderedMarkdown || "<p>Markdown 미리보기가 여기에 표시됩니다.</p>";
}

function normalizeMarkdown(markdown) {
  return markdown.replace(/\r\n/g, "\n").trim() + "\n";
}

function inferBaseName(filename, nextExtension) {
  if (!filename) {
    return `converted${nextExtension}`;
  }
  const lastDot = filename.lastIndexOf(".");
  const stem = lastDot >= 0 ? filename.slice(0, lastDot) : filename;
  return `${stem}${nextExtension}`;
}

async function saveBlob(blob, filename, accept = {}) {
  if ("showSaveFilePicker" in window) {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "Converted file",
          accept,
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function saveText(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  await saveBlob(blob, filename, { [mime]: [filename.slice(filename.lastIndexOf("."))] });
}

function updateDocxSelected(file) {
  if (!file) {
    docxSelected.hidden = true;
    docxSelected.innerHTML = "";
    return;
  }

  docxSelected.hidden = false;
  docxSelected.innerHTML = `<strong>선택된 DOCX 파일</strong>${file.name}`;
}

async function readTextFile(accept) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  return new Promise((resolve, reject) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        resolve({ file, text });
      } catch (error) {
        reject(error);
      }
    });
    input.click();
  });
}

async function convertDocxToHtml(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read("base64");
        return {
          src: `data:${image.contentType};base64,${base64}`,
        };
      }),
    },
  );

  return sanitizeHtml(result.value);
}

function convertHtmlToMarkdown(html) {
  const clean = sanitizeHtml(html);
  const markdown = turndown.turndown(clean);
  return normalizeMarkdown(markdown);
}

function convertMarkdownToHtml(markdown) {
  const rendered = marked.parse(markdown || "");
  return sanitizeHtml(rendered);
}

function headingLevelFor(tagName) {
  switch (tagName) {
    case "H1":
      return HeadingLevel.HEADING_1;
    case "H2":
      return HeadingLevel.HEADING_2;
    case "H3":
      return HeadingLevel.HEADING_3;
    case "H4":
      return HeadingLevel.HEADING_4;
    case "H5":
      return HeadingLevel.HEADING_5;
    default:
      return HeadingLevel.HEADING_6;
  }
}

function mergeTextRuns(runs) {
  return runs.length ? runs : [new TextRun("")];
}

function parseInlineNodes(node, style = {}) {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.textContent ?? "";
    if (!value) {
      return [];
    }
    return [new TextRun({ text: value, ...style })];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const nextStyle = { ...style };
  const tagName = node.tagName.toUpperCase();

  if (tagName === "STRONG" || tagName === "B") nextStyle.bold = true;
  if (tagName === "EM" || tagName === "I") nextStyle.italics = true;
  if (tagName === "U") nextStyle.underline = {};
  if (tagName === "CODE") {
    nextStyle.font = "Consolas";
    nextStyle.shading = { type: ShadingType.CLEAR, fill: "F1F5F9" };
  }

  if (tagName === "BR") {
    return [new TextRun({ break: 1, ...style })];
  }

  if (tagName === "A") {
    const children = Array.from(node.childNodes).flatMap((child) =>
      parseInlineNodes(child, {
        ...nextStyle,
        color: "0F766E",
        underline: {},
      }),
    );
    const href = node.getAttribute("href");
    if (!href) {
      return children;
    }
    return [new ExternalHyperlink({ link: href, children: mergeTextRuns(children) })];
  }

  if (tagName === "IMG") {
    const src = node.getAttribute("src") || "";
    if (src.startsWith("data:image/")) {
      const [meta, payload] = src.split(",", 2);
      const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/png";
      const binary = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
      return [
        new ImageRun({
          data: binary,
          transformation: { width: 480, height: 320 },
          type: mime.includes("jpeg") ? "jpg" : "png",
        }),
      ];
    }

    return [new TextRun({ text: `[Image: ${src}]`, italics: true, color: "64748B" })];
  }

  return Array.from(node.childNodes).flatMap((child) => parseInlineNodes(child, nextStyle));
}

function buildListParagraphs(listNode, ordered = false) {
  return Array.from(listNode.children)
    .filter((child) => child.tagName?.toUpperCase() === "LI")
    .map((item) => {
      const children = Array.from(item.childNodes).flatMap((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tagName = child.tagName.toUpperCase();
          if (tagName === "UL" || tagName === "OL") {
            return [];
          }
        }
        return parseInlineNodes(child);
      });

      return new Paragraph({
        children: mergeTextRuns(children),
        spacing: { after: 120 },
        ...(ordered
          ? { numbering: { reference: "main-numbering", level: 0 } }
          : { bullet: { level: 0 } }),
      });
    });
}

function buildTable(tableNode) {
  const rows = Array.from(tableNode.querySelectorAll("tr")).map((rowNode) =>
    new TableRow({
      children: Array.from(rowNode.children).map((cellNode) =>
        new TableCell({
          width: { size: 33, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: mergeTextRuns(Array.from(cellNode.childNodes).flatMap((child) => parseInlineNodes(child))),
            }),
          ],
        }),
      ),
    }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

function blockNodeToDocx(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent || "").trim();
    return text ? [new Paragraph({ children: [new TextRun(text)] })] : [];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const tagName = node.tagName.toUpperCase();
  const children = Array.from(node.childNodes).flatMap((child) => parseInlineNodes(child));

  if (/^H[1-6]$/.test(tagName)) {
    return [
      new Paragraph({
        heading: headingLevelFor(tagName),
        children: mergeTextRuns(children),
        spacing: { before: 240, after: 120 },
      }),
    ];
  }

  if (tagName === "P") {
    return [
      new Paragraph({
        children: mergeTextRuns(children),
        spacing: { after: 160 },
      }),
    ];
  }

  if (tagName === "BLOCKQUOTE") {
    return [
      new Paragraph({
        children: mergeTextRuns(children),
        spacing: { after: 160 },
        indent: { left: 720 },
        border: {
          left: {
            color: "94A3B8",
            style: BorderStyle.SINGLE,
            size: 12,
          },
        },
      }),
    ];
  }

  if (tagName === "PRE") {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: node.textContent ?? "",
            font: "Consolas",
          }),
        ],
        spacing: { after: 160 },
        shading: { type: ShadingType.CLEAR, fill: "E2E8F0" },
      }),
    ];
  }

  if (tagName === "UL") {
    return buildListParagraphs(node, false);
  }

  if (tagName === "OL") {
    return buildListParagraphs(node, true);
  }

  if (tagName === "TABLE") {
    return [buildTable(node)];
  }

  if (tagName === "HR") {
    return [
      new Paragraph({
        border: {
          bottom: {
            color: "CBD5E1",
            style: BorderStyle.SINGLE,
            size: 6,
          },
        },
      }),
    ];
  }

  if (tagName === "DIV" || tagName === "SECTION" || tagName === "ARTICLE") {
    return Array.from(node.childNodes).flatMap((child) => blockNodeToDocx(child));
  }

  return [
    new Paragraph({
      children: mergeTextRuns(children),
      spacing: { after: 160 },
    }),
  ];
}

async function buildDocxBlobFromHtml(html, title) {
  const clean = sanitizeHtml(html);
  const parser = new DOMParser();
  const doc = parser.parseFromString(clean, "text/html");
  const content = Array.from(doc.body.childNodes).flatMap((node) => blockNodeToDocx(node));

  const document = new Document({
    creator: "Converter Docs App",
    title,
    numbering: {
      config: [
        {
          reference: "main-numbering",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 260 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        children: content.length ? content : [new Paragraph("")],
      },
    ],
  });

  return Packer.toBlob(document);
}

async function docxToHtmlFlow() {
  const file = docxInput.files?.[0];
  if (!file) {
    throw new Error("먼저 DOCX 파일을 선택해 주세요.");
  }

  setStatus("info", "DOCX를 HTML로 변환 중입니다...");
  const html = await convertDocxToHtml(file);
  htmlEditor.value = html;
  renderPreviews();
  setStatus("info", "DOCX를 HTML로 변환했습니다.");
}

async function docxToMarkdownFlow() {
  const file = docxInput.files?.[0];
  if (!file) {
    throw new Error("먼저 DOCX 파일을 선택해 주세요.");
  }

  setStatus("info", "DOCX를 Markdown으로 변환 중입니다...");
  const html = await convertDocxToHtml(file);
  const markdown = convertHtmlToMarkdown(html);
  htmlEditor.value = html;
  markdownEditor.value = markdown;
  renderPreviews();
  setStatus("info", "DOCX를 Markdown으로 변환했습니다.");
}

async function markdownToHtmlFlow() {
  setStatus("info", "Markdown을 HTML로 변환 중입니다...");
  htmlEditor.value = convertMarkdownToHtml(markdownEditor.value);
  renderPreviews();
  setStatus("info", "Markdown을 HTML로 변환했습니다.");
}

async function htmlToMarkdownFlow() {
  setStatus("info", "HTML을 Markdown으로 변환 중입니다...");
  markdownEditor.value = convertHtmlToMarkdown(htmlEditor.value);
  renderPreviews();
  setStatus("info", "HTML을 Markdown으로 변환했습니다.");
}

async function markdownToDocxFlow() {
  setStatus("info", "Markdown을 DOCX로 변환 중입니다...");
  const html = convertMarkdownToHtml(markdownEditor.value);
  const blob = await buildDocxBlobFromHtml(html, "Markdown Export");
  await saveBlob(
    blob,
    inferBaseName(docxInput.files?.[0]?.name || "markdown-export.md", ".docx"),
    {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
  );
  setStatus("info", "Markdown DOCX 저장이 완료되었습니다.");
}

async function htmlToDocxFlow() {
  setStatus("info", "HTML을 DOCX로 변환 중입니다...");
  const blob = await buildDocxBlobFromHtml(htmlEditor.value, "HTML Export");
  await saveBlob(
    blob,
    inferBaseName(docxInput.files?.[0]?.name || "html-export.html", ".docx"),
    {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
  );
  setStatus("info", "HTML DOCX 저장이 완료되었습니다.");
}

docxInput.addEventListener("change", () => {
  updateDocxSelected(docxInput.files?.[0] || null);
});

markdownEditor.addEventListener("input", renderPreviews);
htmlEditor.addEventListener("input", renderPreviews);

document.getElementById("docx-to-md").addEventListener("click", async () => {
  try {
    await docxToMarkdownFlow();
  } catch (error) {
    setStatus("error", error.message || "DOCX 변환 중 오류가 발생했습니다.");
  }
});

document.getElementById("docx-to-html").addEventListener("click", async () => {
  try {
    await docxToHtmlFlow();
  } catch (error) {
    setStatus("error", error.message || "DOCX 변환 중 오류가 발생했습니다.");
  }
});

document.getElementById("md-to-html").addEventListener("click", async () => {
  try {
    await markdownToHtmlFlow();
  } catch (error) {
    setStatus("error", error.message || "Markdown 변환 중 오류가 발생했습니다.");
  }
});

document.getElementById("html-to-md").addEventListener("click", async () => {
  try {
    await htmlToMarkdownFlow();
  } catch (error) {
    setStatus("error", error.message || "HTML 변환 중 오류가 발생했습니다.");
  }
});

document.getElementById("md-to-docx").addEventListener("click", async () => {
  try {
    await markdownToDocxFlow();
  } catch (error) {
    setStatus("error", error.message || "DOCX 저장 중 오류가 발생했습니다.");
  }
});

document.getElementById("html-to-docx").addEventListener("click", async () => {
  try {
    await htmlToDocxFlow();
  } catch (error) {
    setStatus("error", error.message || "DOCX 저장 중 오류가 발생했습니다.");
  }
});

document.getElementById("load-md").addEventListener("click", async () => {
  try {
    const result = await readTextFile(".md,.markdown,.txt,text/markdown,text/plain");
    if (!result) {
      return;
    }
    markdownEditor.value = result.text;
    renderPreviews();
    setStatus("info", `${result.file.name} 파일을 Markdown 편집기에 불러왔습니다.`);
  } catch (error) {
    setStatus("error", error.message || "Markdown 파일을 읽지 못했습니다.");
  }
});

document.getElementById("load-html").addEventListener("click", async () => {
  try {
    const result = await readTextFile(".html,.htm,text/html,text/plain");
    if (!result) {
      return;
    }
    htmlEditor.value = result.text;
    renderPreviews();
    setStatus("info", `${result.file.name} 파일을 HTML 편집기에 불러왔습니다.`);
  } catch (error) {
    setStatus("error", error.message || "HTML 파일을 읽지 못했습니다.");
  }
});

document.getElementById("save-md").addEventListener("click", async () => {
  try {
    await saveText(markdownEditor.value, "converted.md", "text/markdown");
    setStatus("info", "Markdown 파일 저장이 완료되었습니다.");
  } catch (error) {
    setStatus("error", error.message || "Markdown 파일 저장에 실패했습니다.");
  }
});

document.getElementById("save-html").addEventListener("click", async () => {
  try {
    await saveText(htmlEditor.value, "converted.html", "text/html");
    setStatus("info", "HTML 파일 저장이 완료되었습니다.");
  } catch (error) {
    setStatus("error", error.message || "HTML 파일 저장에 실패했습니다.");
  }
});

renderPreviews();
