use aruna_rust_api::api::storage::models::v2::{
    generic_resource::Resource, Collection, KeyValue, Object, Project, Stats,
};

pub fn get_demo_data() -> Vec<Resource> {
    let resources = vec![
        Resource::Collection(Collection {
            id: "SRE-20001-22000".to_string(),
            name: "SRE-20001-22000".to_string(),
            description: "A metagenomic dataset from somewhere!".to_string(),
            key_values: vec![KeyValue {
                key: "experiment".to_string(),
                value: "Plasmidhunter".to_string(),
                ..Default::default()
            }],
            stats: Some(Stats {
                count: 1,
                size: 882131238,
                last_updated: None,
            }),
            data_class: 1,
            ..Default::default()
        }),
        Resource::Object(Object {
            id: "01H93HDRV1ZAJH8AT880CH8C0R".to_string(),
            name: "SRE-123123-1231231231".to_string(),
            description: "A biodiversic biodiversity experiment from somewhere!".to_string(),
            key_values: vec![
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
            ],
            content_len: 10,
            data_class: 2,
            ..Default::default()
        }),
        Resource::Object(Object {
            id: "01H93HDRV1ZAJH8AT880CH8C0R".to_string(),
            name: "SRE-123123-1231231231".to_string(),
            description: "A biodiversic biodiversity experiment from somewhere!".to_string(),
            key_values: vec![
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
            ],
            content_len: 123123123123123123,
            data_class: 2,
            ..Default::default()
        }),
        Resource::Project(Project {
            id: "01H93HDRV1ZAJH8AT880CH8C0R".to_string(),
            name: "SRE-123123-1231231231".to_string(),
            description: "A biodiversic biodiversity experiment from somewhere!".to_string(),
            key_values: vec![
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
            ],
            stats: Some(Stats {
                count: 1123123,
                size: 123,
                last_updated: None,
            }),
            data_class: 2,
            ..Default::default()
        }),
        Resource::Object(Object {
            id: "01H93HDRV1ZAJH8AT880CH8C0R".to_string(),
            name: "SRE-123123-1231231231".to_string(),
            description: "A biodiversic biodiversity experiment from somewhere!".to_string(),
            key_values: vec![
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
            ],
            content_len: 123123123,
            data_class: 2,
            ..Default::default()
        }),
    ];
    resources
}

pub fn get_mock_by_id(id: String) -> Resource {
    let from_mocks = get_demo_data();
    let res = from_mocks
        .iter()
        .find(|x| match x {
            Resource::Object(obj) => obj.id == id,
            Resource::Collection(col) => col.id == id,
            Resource::Dataset(ds) => ds.id == id,
            Resource::Project(proj) => proj.id == id,
        })
        .unwrap();
    res.clone()
}
