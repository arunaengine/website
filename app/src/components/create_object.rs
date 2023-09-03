use leptos::{html::Select, *};
use leptos_router::*;

#[component]
pub fn CreateObjectPage() -> impl IntoView {
    let header = move || {
        view! {
            <div class="container-xl">
                <div class="row g-2">
                    <div class="col">
                        <div class="page-pretitle text-start">
                            Create
                        </div>
                        <h2 class="page-title">
                            Resource
                        </h2>
                    </div>
                </div>
            </div>
        }
    };

    let resource_type = create_node_ref::<html::Select>();

    let is_project = move || match resource_type.get() {
        Some(e) => e.value() == "1",
        None => false,
    };

    let main = move || {
        view! {
            <div class="row row-cards">
                <div class="col-lg-12">

                    <form class="card">
                        <div class="card-header">
                            <h4 class="card-title">
                                Create a new resource
                            </h4>
                        </div>

                        <div class="card-body">
                            <div class="row g-5">
                                <div class="col-lg-4 mb-3 text-start">
                                    <label class="form-label">"Resource type"</label>
                                    <select
                                        _ref=resource_type
                                        type="text"
                                        class="form-select"
                                        id="Resource"
                                        value=""
                                        tabindex="1"
                                    >
                                        <option value="1">
                                            Project
                                        </option>
                                        <option value="2">
                                            Collection
                                        </option>
                                        <option value="3">
                                            Dataset
                                        </option>
                                        <option value="4">
                                            Object
                                        </option>
                                    </select>
                                    <small class="form-hint">"Every resource has a type"</small>
                                </div>
                                {move || {
                                    if !is_project() {
                                        view! {
                                            <div class="col-lg-4 mb-3 text-start">
                                                <label class="form-label required">
                                                    "Parent ID"
                                                </label>
                                                <div>
                                                        <input
                                                            type="text"
                                                            class="form-control text-uppercase"
                                                            pattern={"^[0-7][0-9A-HJKMNP-TV-Z]{25}$"}
                                                            id="resid"
                                                            name="resid"
                                                            placeholder="Resource ID"
                                                            required
                                                        />
                                                    <small class="form-hint">
                                                        "We'll never share your email with anyone else."
                                                    </small>
                                                </div>
                                            </div>
                                        }
                                            .into_view()
                                    } else {
                                        ().into_view()
                                    }
                                }}
                            </div>
                        </div>
                    </form>

                </div>

            </div>
        }
    };

    view! {
        <div class="page-wrapper d-print-none">
            <div class="page-header">{header}</div>
            <div class="page-body mt-2">
                <div class="container-xl">{main}</div>
            </div>
        </div>
    }
}
