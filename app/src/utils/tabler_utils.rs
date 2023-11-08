use leptos::*;
use std::fmt::Display;

#[derive(Debug, Clone, Copy)]
pub enum Colors {
    Primary,
    Secondary,
    Success,
    Info,
    Warning,
    Danger,
    Light,
    Dark,
    White,
    Muted,
    Blue,
    Azure,
    Indigo,
    Purple,
    Pink,
    Red,
    Orange,
    Yellow,
    Lime,
    Green,
    Teal,
    Cyan,
    None,
}

impl Display for Colors {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Colors::None => f.write_str(""),
            _ => f.write_str(format!("{:?}", self).to_lowercase().as_str()),
        }
    }
}

pub fn add_bg_color(class: &str, color: Colors) -> String {
    format!("{} bg-{}", class, color)
}

pub fn add_text_color(class: &str, color: Colors) -> String {
    format!("{} text-{}", class, color)
}

pub fn custom_select(_name: String, variants: Vec<String>) -> impl IntoView {
    let (read_selected, write_selected) = create_signal(
        variants
            .first()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "Custom".to_string()),
    );

    let variants_option = move |vars: Vec<String>| {
        vars.into_iter()
            .map(|variant| {
                view! { <option value=variant.to_string()>{variant.to_string()}</option> }
            })
            .collect::<Vec<_>>()
    };

    let _variants_a = move |vars: Vec<String>| {
        vars.into_iter()
            .map(|variant| {
                let var_clone = variant.clone();
                view! {
                    <a
                        class="dropdown-item"
                        on:click=move |_| { write_selected.set(var_clone.clone()) }
                    >
                        {variant.to_string()}
                    </a>
                }
            })
            .collect::<Vec<_>>()
    };

    let _cloned_vars = variants.clone();

    view! {
        <div class="input-group d-inline-flex">
            <select
                class="form-select"
                on:input=move |ev| {
                    write_selected(event_target_value(&ev));
                }

                selected=move || read_selected.get()
            >
                {variants_option(variants.clone())}
                <option value="Custom">Custom</option>
            </select>
            <Show when=move || read_selected.get() == "Custom" fallback=move || ()>
                <input type="text" class="form-control" aria-label="Custom"/>

            </Show>
        </div>
    }
}
