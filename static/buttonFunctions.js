function deleteDataset(id) {
  const csrfToken = document.querySelector("[name='csrf-token']").content
  fetch("/dataset/delete/" + id, {method: "delete", headers:{"X-CSRF-Token": csrfToken}}).then(data => location.reload()).catch((error) => {
      console.error('Error:', error);
    });
}

function deleteDatasetVersion(id) {
  const csrfToken = document.querySelector("[name='csrf-token']").content
  fetch("/datasetversion/delete/" + id, {method: "DELETE", credentials: "same-origin", headers:{"X-CSRF-Token": csrfToken}})
  .catch((error) => {
    console.error('Error:', error);
  }).then(data => location.reload())
}

function deleteProject(id) {
  const csrfToken = document.querySelector("[name='csrf-token']").content
  fetch("/project/" + id, {method: "DELETE", credentials: "same-origin", headers:{"X-CSRF-Token": csrfToken}})
  .catch((error) => {
    console.error('Error:', error);
  }).then(data => location.reload())
}

function deleteDatasetObject(id) {
  const csrfToken = document.querySelector("[name='csrf-token']").content
  fetch("/datasetobjectsgroup/delete/" + id, {method: "DELETE", credentials: "same-origin", headers:{"X-CSRF-Token": csrfToken}})
  .catch((error) => {
    console.error('Error:', error);
  }).then(data => location.reload())
}

function getUserName() {
  fetch("/auth/user", {method: "GET", credentials: "same-origin"})
  .catch((error) => {
    console.error('Error:', error);
  }).then((data) => data.json()).then((data) => console.log(data))
}

getUserName()