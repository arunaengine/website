use leptos::*;
use leptos_meta::*;

#[component]
pub fn About(cx: Scope) -> impl IntoView {
    provide_meta_context(cx);

    view! {cx,

    <div class="card px-4 my-5 text-center col-10 mx-auto">
        <img class="d-block mx-auto" src="/aruna_icon.png" alt="" width="72" />
        <div class="card-body">
        <h1 class="display-5 fw-bold text-body-emphasis">"About Us"</h1>
            <div class="col-lg-10 col-md-10 mx-auto">
                <p class="lead mb-4">"We are a small team of developers from the Justus Liebig University in Gießen interested in developing advanced cloud native infrastructure and applications. With this expertise, we would like to further develop the fundamental way in which data management and storage is conducted in research in the future. As the Aruna Object Storage is part of the visionary Gaia-X project, the goal is the implementation of a cloud-native, geo-redundant, scalable, domain-agnostic and performant object storage system for scientists as well as corporate members."</p>
                <p class="lead mb-4">"We are funded from the project FAIR Data Spaces and various consortia of the NFDI (Nationale Forschungsdateninfrastruktur), associations of different institutions within a research field, which must also be mentioned accordingly as early adopters of the system with their unprecedented contribution."</p>
            </div>
        </div>
    </div>
    }
}
