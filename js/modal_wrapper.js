export function toggle_modal(id) {
    var myModalEl = document.querySelector('#'+id)
    var modal = bootstrap.Modal.getOrCreateInstance(myModalEl)
    modal.toggle()
}