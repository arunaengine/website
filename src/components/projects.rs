use leptos::*;
use leptos_meta::*;

#[component]
pub fn ProjectsOverview(cx: Scope) -> impl IntoView {
    provide_meta_context(cx);

    view! {cx,
    <div class="page-header d-print-none my-3">
        <div class="container-xl">
        <div class="row g-2 align-items-center">
            <div class="col">
            <h2 class="page-title">
                "Projects"
            </h2>
            </div>
        </div>
        </div>
    </div>
    <div class="container-xl mt-2">
        <div class="card">
            <div class="table-responsive">
                <table class="table table-vcenter card-table">
                    <thead>
                    <tr>
                        <th>"Id"</th>
                        <th>"Name"</th>
                        <th>"Role"</th>
                        <th class="w-1">"Actions"</th>
                    </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="4">"Looks like you are currently not associated with any project!"</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    }
}
