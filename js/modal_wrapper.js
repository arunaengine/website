export function toggle_modal(id) {
    var myModalEl = document.querySelector('#'+id)
    var modal = bootstrap.Modal.getOrCreateInstance(myModalEl)
    modal.toggle()
}

export function show_modal(id) {
    var myModalEl = document.querySelector('#'+id)
    var modal = bootstrap.Modal.getOrCreateInstance(myModalEl)
    modal.show()
}

export function hide_modal(id) {
    var myModalEl = document.querySelector('#'+id)
    var modal = bootstrap.Modal.getOrCreateInstance(myModalEl)
    modal.hide()
}