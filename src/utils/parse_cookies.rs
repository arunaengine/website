pub fn parse_cookies(cok: String, key: &str) -> Option<String> {
    let splitted = cok.split(";");
    for split in splitted {
        if split.trim().starts_with(key) {
            let mut splits = split.trim().split('=');
            splits.next();
            return splits.next().map(|e| e.to_string());
        }
    }
    None
}
