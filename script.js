const draftKey = "zdayka_demo_draft_v1";
const quickForm = document.getElementById("quick-form");
const description = document.getElementById("description");
const workType = document.getElementById("work-type");
const subject = document.getElementById("subject");
const dialog = document.getElementById("details-dialog");
const detailsForm = document.getElementById("details-form");
const deadline = document.getElementById("deadline");

function readDraft() {
  try { return JSON.parse(localStorage.getItem(draftKey) || "null"); }
  catch { return null; }
}

function writeDraft(draft) {
  try { localStorage.setItem(draftKey, JSON.stringify(draft)); return true; }
  catch { return false; }
}

function updateCount() {
  document.getElementById("character-count").textContent = `${description.value.length} / 3000`;
}

function syncChoices() {
  document.querySelectorAll(".choice-list").forEach(list => {
    const target = document.getElementById(list.dataset.target);
    list.querySelectorAll("button").forEach(button => {
      button.setAttribute("aria-pressed", String(target.value === button.dataset.value));
    });
  });
}

document.querySelectorAll(".choice-list button").forEach(button => {
  button.addEventListener("click", () => {
    const select = document.getElementById(button.closest(".choice-list").dataset.target);
    select.value = button.dataset.value;
    syncChoices();
    document.getElementById("quick-form").scrollIntoView({ behavior: "smooth", block: "center" });
  });
});

workType.addEventListener("change", syncChoices);
subject.addEventListener("change", syncChoices);
description.addEventListener("input", () => {
  updateCount();
  document.getElementById("description-error").textContent = "";
});

function displayDraft(draft) {
  const hasDraft = Boolean(draft?.description && draft?.deadline);
  document.getElementById("cabinet-empty").hidden = hasDraft;
  document.getElementById("cabinet-card").hidden = !hasDraft;
  document.getElementById("edit-draft").hidden = !hasDraft;
  if (!hasDraft) return;
  document.getElementById("draft-type").textContent = draft.workType || "Не вказано";
  document.getElementById("draft-subject").textContent = draft.subject || "Не вказано";
  document.getElementById("draft-deadline").textContent = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${draft.deadline}T12:00:00`));
  document.getElementById("draft-description").textContent = draft.description;
  document.getElementById("draft-date").textContent = "Збережено в цьому браузері";
}

quickForm.addEventListener("submit", event => {
  event.preventDefault();
  if (description.value.trim().length < 15) {
    document.getElementById("description-error").textContent = "Опиши завдання хоча б кількома словами.";
    description.focus();
    return;
  }
  document.getElementById("deadline-error").textContent = "";
  dialog.showModal();
});

document.getElementById("close-dialog").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });

detailsForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!deadline.value) {
    document.getElementById("deadline-error").textContent = "Обери приблизну або точну дату.";
    deadline.focus();
    return;
  }
  const draft = {
    description: description.value.trim(),
    workType: workType.value,
    subject: subject.value,
    deadline: deadline.value,
    savedAt: new Date().toISOString()
  };
  if (!writeDraft(draft)) {
    document.getElementById("deadline-error").textContent = "Браузер не дозволив зберегти чернетку.";
    return;
  }
  displayDraft(draft);
  dialog.close();
  document.getElementById("demo-cabinet").scrollIntoView({ behavior: "smooth" });
});

document.getElementById("edit-draft").addEventListener("click", () => {
  document.getElementById("quick-form").scrollIntoView({ behavior: "smooth", block: "center" });
  description.focus();
});

const savedDraft = readDraft();
if (savedDraft?.description) {
  description.value = savedDraft.description;
  workType.value = savedDraft.workType || "";
  subject.value = savedDraft.subject || "";
  deadline.value = savedDraft.deadline || "";
}
deadline.min = new Date().toISOString().slice(0, 10);
updateCount();
syncChoices();
displayDraft(savedDraft);
