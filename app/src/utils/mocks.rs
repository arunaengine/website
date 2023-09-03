use aruna_rust_api::api::storage::models::v2::{
    generic_resource::Resource, ExternalRelation, InternalRelation, KeyValue, Object, Project,
    Relation, Stats,
};

pub fn get_demo_data() -> Vec<Resource> {
    let resources = vec![
        Resource::Project(Project {
            id: "01H9ASVT3V0S08JRFA4DH6G96M".to_string(),
            name: "plasmid-tracker".to_string(),
            description: "Plasmids play an important role in the genetic variability of organisms. They replicate independently and between organisms - within and between species. Therefore, plasmids are key drivers of horizontal gene transfer. Often, they are the effective and only difference between commensal and pathogenic bacterial strains. In recent years, it became obvious that plasmids belong to the main mechanisms for the dissemination of antimicrobial resistances and hence are of special interest in medical microbiology. Detecting plasmids and analyzing their dissemination is an important epidemiological and scientific topic that might help to detect current and prevent future outbreaks of antibiotic resistances.".to_string(),
            key_values: vec![
                KeyValue {
                    key: "app.aruna-storage.org/experiment".to_string(),
                    value: "PlasmidTracker".to_string(),
                    variant: 1,
                },
                KeyValue {
                    key: "app.aruna-storage.org/project".to_string(),
                    value: "NFDI-4-Microbiota".to_string(),
                    variant: 1,
                },
                KeyValue {
                    key: "plastrack.count_kmers".to_string(),
                    value: "true".to_string(),
                    variant: 3,
                },
                KeyValue {
                    key: "plastrack.mash".to_string(),
                    value: "true".to_string(),
                    ..Default::default()
                },
            ],
            stats: Some(Stats { count: 12312, size: 13288319232231, last_updated: None }),
            data_class: 1,

            relations: vec![
                Relation {
                    relation: Some(
                        aruna_rust_api::api::storage::models::v2::relation::Relation::Internal(
                            InternalRelation {
                                resource_id: "01H93HDRV1ZAJH8AT880CH8C0R".to_string(),
                                resource_variant: 2,
                                defined_variant: 1,
                                custom_variant: None,
                                direction: 2,
                            },
                        ),
                    ),
                },
                Relation {
                    relation: Some(
                        aruna_rust_api::api::storage::models::v2::relation::Relation::Internal(
                            InternalRelation {
                                resource_id: "01H992S0HP3JPMJQK86593F16T".to_string(),
                                resource_variant: 1,
                                defined_variant: 2,
                                custom_variant: None,
                                direction: 2,
                            },
                        ),
                    ),
                },
                Relation {
                    relation: Some(
                        aruna_rust_api::api::storage::models::v2::relation::Relation::Internal(
                            InternalRelation {
                                resource_id: "01H992V3X8VEVHAS65VEPRCAWY".to_string(),
                                resource_variant: 4,
                                defined_variant: 1,
                                custom_variant: None,
                                direction: 2,
                            },
                        ),
                    ),
                },
                Relation {
                    relation: Some(
                        aruna_rust_api::api::storage::models::v2::relation::Relation::Internal(
                            InternalRelation {
                                resource_id: "01H992V3X8VEVHAS65VEPRCAWY".to_string(),
                                resource_variant: 4,
                                defined_variant: 4,
                                custom_variant: None,
                                direction: 1,
                            },
                        ),
                    ),
                },
                Relation {
                    relation: Some(
                        aruna_rust_api::api::storage::models::v2::relation::Relation::External(
                            ExternalRelation {
                                identifier:
                                    "https://www.ebi.ac.uk/metagenomics/analyses/MGYA00031620"
                                        .to_string(),
                                defined_variant: 2,
                                custom_variant: None,
                            },
                        ),
                    ),
                },
                Relation {
                    relation: Some(
                        aruna_rust_api::api::storage::models::v2::relation::Relation::External(
                            ExternalRelation {
                                identifier: "https://doi.org/10.1186/s13059-016-0997-x".to_string(),
                                defined_variant: 4,
                                custom_variant: Some("DOI".to_string()),
                            },
                        ),
                    ),
                },
            ],
            ..Default::default()
        }),
        Resource::Object(Object {
            id: "01H93HDRV1ZAJH8AT880CH8C0R".to_string(),
            name: "MGYS00000633".to_string(),
            description: "The microbial composition of the gut likely contributes to a wide-range of health and disease states including intestinal inflammation, atopic disease, and possibly diseases of adulthood, such as heart disease and obesity. The early establishment of the gut microflora is suspected to have a particularly profound impact protecting the gut from infectious disease and on long-term subsequent health by predisposing individuals to atopic or autoimmune disease later in life. In contrast to the large-scale efforts of the Human Microbiome Project to characterize the microbial flora of healthy adults.".to_string(),
            key_values: vec![
                KeyValue {
                    key: "app.aruna-storage.org/data-format".to_string(),
                    value: "FASTA".to_string(),
                    variant: 2,
                },
                KeyValue {
                    key: "app.aruna-storage.org/variant".to_string(),
                    value: "Sample".to_string(),
                    variant: 1,
                },
                KeyValue {
                    key: "app.aruna-storage.org/experiment".to_string(),
                    value: "PlasmidTracker".to_string(),
                    variant: 1,
                },
                KeyValue {
                    key: "app.aruna-storage.org/project".to_string(),
                    value: "NFDI-4-Microbiota".to_string(),
                    variant: 1,
                },
                KeyValue {
                    key: "plastrack.count_kmers".to_string(),
                    value: "true".to_string(),
                    variant: 3,
                },
                KeyValue {
                    key: "plastrack.mash".to_string(),
                    value: "true".to_string(),
                    ..Default::default()
                },
            ],
            content_len: 123123123,
            data_class: 2,

            relations: vec![
                Relation {
                    relation: Some(
                        aruna_rust_api::api::storage::models::v2::relation::Relation::Internal(
                            InternalRelation {
                                resource_id: "01H93HDRV1ZAJH8AT880CH8C0R".to_string(),
                                resource_variant: 2,
                                defined_variant: 1,
                                custom_variant: None,
                                direction: 2,
                            },
                        ),
                    ),
                },
                Relation {
                    relation: Some(
                        aruna_rust_api::api::storage::models::v2::relation::Relation::Internal(
                            InternalRelation {
                                resource_id: "01H992S0HP3JPMJQK86593F16T".to_string(),
                                resource_variant: 1,
                                defined_variant: 2,
                                custom_variant: None,
                                direction: 2,
                            },
                        ),
                    ),
                },
                Relation {
                    relation: Some(
                        aruna_rust_api::api::storage::models::v2::relation::Relation::Internal(
                            InternalRelation {
                                resource_id: "01H992V3X8VEVHAS65VEPRCAWY".to_string(),
                                resource_variant: 4,
                                defined_variant: 1,
                                custom_variant: None,
                                direction: 2,
                            },
                        ),
                    ),
                },
                Relation {
                    relation: Some(
                        aruna_rust_api::api::storage::models::v2::relation::Relation::Internal(
                            InternalRelation {
                                resource_id: "01H992V3X8VEVHAS65VEPRCAWY".to_string(),
                                resource_variant: 4,
                                defined_variant: 4,
                                custom_variant: None,
                                direction: 1,
                            },
                        ),
                    ),
                },
                Relation {
                    relation: Some(
                        aruna_rust_api::api::storage::models::v2::relation::Relation::External(
                            ExternalRelation {
                                identifier:
                                    "https://www.ebi.ac.uk/metagenomics/analyses/MGYA00031620"
                                        .to_string(),
                                defined_variant: 2,
                                custom_variant: None,
                            },
                        ),
                    ),
                },
                Relation {
                    relation: Some(
                        aruna_rust_api::api::storage::models::v2::relation::Relation::External(
                            ExternalRelation {
                                identifier: "https://doi.org/10.1186/s13059-016-0997-x".to_string(),
                                defined_variant: 4,
                                custom_variant: Some("DOI".to_string()),
                            },
                        ),
                    ),
                },
            ],
            ..Default::default()
        }),
        Resource::Object(Object {
            id: "01H93HDRV1ZAJH8AT880CH8C0R".to_string(),
            name: "SRE-123123-1231231231".to_string(),
            description: "A biodiversic biodiversity experiment from somewhere!".to_string(),
            key_values: vec![
                KeyValue {
                    key: "experiment".to_string(),
                    value: "PlasmidTracker".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "PlasmidTracker".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "PlasmidTracker".to_string(),
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
                    value: "PlasmidTracker".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "PlasmidTracker".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "PlasmidTracker".to_string(),
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
                    value: "PlasmidTracker".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "PlasmidTracker".to_string(),
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
