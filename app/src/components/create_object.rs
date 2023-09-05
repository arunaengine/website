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

    let (read_type_select, write_type_select) = create_signal::<String>("1".to_string());

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
                                        on:input=move |ev| {
                                            write_type_select(event_target_value(&ev));
                                        }
                                        type="text"
                                        class="form-select"
                                        id="Resource"
                                        value="1"
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
                                <Show
                                when=move || read_type_select() != "1"
                                    fallback=|| ()
                                >
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
                                                    "Each non project resource must be associated with an existing parent"
                                                </small>
                                            </div>
                                        </div>
                                </Show>

                                <div class="col-lg-4 mb-3 text-start">
                                    <label class="form-label required">
                                        "Name"
                                    </label>
                                    <div>
                                            <input
                                                type="text"
                                                class="form-control text-uppercase"
                                                id="resname"
                                                name="resname"
                                                placeholder="Resource Name"
                                                required
                                            />
                                        <small class="form-hint">
                                            "The name of the resource, cannot contain spaces or special characters"
                                        </small>
                                    </div>
                                </div>

                                <div class="col-12 text-start">
                                    <label class="form-label">"Description"<span class="form-label-description">0/1000</span></label>
                                    <textarea class="form-control" name="description-tarea-input" rows="6" placeholder="Description">
                                    </textarea>
                                </div>

                                <div class="table-responsive col-lg-4 mt-5 mb-3 text-start">
                                    <label class="form-label">"Internal relations"</label>
                                    <table class="table table-vcenter text-start">
                                        <thead>
                                            <tr>
                                                <th class="text-start">
                                                    ID
                                                </th>
                                                <th>
                                                    RESOURCE
                                                </th>
                                                <th>
                                                    TYPE
                                                </th>
                                            </tr>
                                        </thead>

                                        <tbody>


                                        </tbody>
                                    </table>
                                    <small class="form-hint">
                                        "Internal relations are connections to other resources within the system"
                                    </small>
                                </div>
                                <div class="table-responsive col-lg-4 mt-5 mb-3 text-start">
                                    <label class="form-label">"External relations"</label>
                                    <table class="table table-vcenter text-start">
                                        <thead>
                                            <tr>
                                                <th class="text-start">
                                                    ID
                                                </th>
                                                <th>
                                                    RESOURCE
                                                </th>
                                                <th>
                                                    TYPE
                                                </th>
                                            </tr>
                                        </thead>

                                        <tbody>


                                        </tbody>
                                    </table>
                                    <small class="form-hint">
                                        "External relations are connections to external resources"
                                    </small>
                                </div>
                                <div class="table-responsive col-lg-4 mt-5 mb-3 text-start">
                                    <label class="form-label">"Labels"</label>
                                    <table class="table table-vcenter text-start">
                                        <thead>
                                            <tr>
                                                <th class="text-start">
                                                    ID
                                                </th>
                                                <th>
                                                    RESOURCE
                                                </th>
                                                <th>
                                                    TYPE
                                                </th>
                                            </tr>
                                        </thead>

                                        <tbody>


                                        </tbody>
                                    </table>
                                    <small class="form-hint">
                                        "Labels are connections to other resources within the system"
                                    </small>
                                </div>
                                <div class="table-responsive col-lg-4 mt-5 mb-3 text-start">
                                    <label class="form-label">"Hooks"</label>
                                    <table class="table table-vcenter text-start">
                                        <thead>
                                            <tr>
                                                <th class="text-start">
                                                    ID
                                                </th>
                                                <th>
                                                    RESOURCE
                                                </th>
                                                <th>
                                                    TYPE
                                                </th>
                                            </tr>
                                        </thead>

                                        <tbody>


                                        </tbody>
                                    </table>
                                    <small class="form-hint">
                                        "Hooks actions that should be performed when the resource is created or updated"
                                    </small>
                                </div>
                                <Show
                                when=move || read_type_select() == "4"
                                    fallback=|| ()
                                >
                                    <div class="col-lg-4 mb-3 text-start">
                                        <div class="mb-3">
                                            <div class="form-label">Upload file</div>
                                            <input type="file" class="form-control" />
                                        </div>
                                    </div>
                                </Show>
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
