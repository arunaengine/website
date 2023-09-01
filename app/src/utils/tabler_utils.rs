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
