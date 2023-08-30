#[cfg(feature = "hydrate")]
use wasm_bindgen::prelude::wasm_bindgen;
#[cfg(feature = "hydrate")]
#[wasm_bindgen(module = "/js/modal_wrapper.js")]
extern "C" {
    pub fn toggle_modal(id: &str);
    pub fn show_modal(id: &str);
    pub fn hide_modal(id: &str);
}

#[cfg(not(feature = "hydrate"))]
#[allow(dead_code)]
pub fn toggle_modal(_id: &str) {}
#[cfg(not(feature = "hydrate"))]
#[allow(dead_code)]
pub fn show_modal(_id: &str) {}
#[cfg(not(feature = "hydrate"))]
#[allow(dead_code)]
pub fn hide_modal(_id: &str) {}
