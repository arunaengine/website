pub struct Cache {
    user_cache: HashMap<String, bool>,
}

impl Cache {
    pub fn new() -> Self {
        Cache {
            user_cache: HashMap::new(),
        }
    }

    pub fn add_to_cache(&mut self, key: &str, val: bool) -> Result<()> {
        self.user_cache.insert(key.to_string(), val);
        Ok(())
    }

    pub fn get_cache(&self, key: &str) -> Result<bool> {
        self.user_cache.get(key).ok()
    }
}
