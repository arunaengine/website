use leptos::*;
use leptos_meta::*;
use leptos_router::*;

#[component]
pub fn TokensOverview(cx: Scope) -> impl IntoView {
    use crate::components::create_token::*;
    use crate::components::token::*;

    provide_meta_context(cx);

    let location = use_location(cx);
    let query_map = location.query;

    let contains_create = move || query_map().get("create").is_some();

    view! {cx,
        <div class="page-header d-print-none my-3">
            <div class="container-xl">
            <div class="row g-2 align-items-center">
                <div class="col">
                <h2 class="page-title">
                    "Tokens"
                </h2>
                </div>
            </div>
            </div>
        </div>
        <div class="container-xl mt-2 text-start">
            <div class="card">
                <div class="table-responsive">
                    <table class="table table-vcenter card-table accordion" id="tokenTable">
                        <thead>
                        <tr>
                            <th>"Id"</th>
                            <th>"Name"</th>
                            <th>"Last used"</th>
                            <th class="w-3 text-center">"Actions"</th>
                        </tr>
                        </thead>
                        <tbody>
                            <Token />
                        </tbody>
                    </table>
                </div>
                <div class="card-footer p-0">
                    <div class="d-flex">
                        <A href="?create" class="btn btn-primary ms-auto m-1">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-plus" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M12 5l0 14"></path>
                                <path d="M5 12l14 0"></path>
                            </svg>
                            "Create Token"
                        </A>
                    </div>
                </div>
            </div>
        </div>
    <div class="page-header d-print-none my-2">
        <div class="container-xl">
            <div class="row g-2 align-items-center">
                <div class="col">
                    <h2 class="page-title">
                        "Sessions"
                    </h2>
                </div>
            </div>
        </div>
    </div>
    <div class="container-xl mt-2 text-start">
        <div class="card">
            <div class="table-responsive">
                <table class="table table-vcenter card-table">
                    <thead>
                    <tr>
                        <th>"Id"</th>
                        <th>"Expires"</th>
                        <th>"Last used"</th>
                        <th class="w-1">"Actions"</th>
                    </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="4" class="text-center">"Looks like you currently have no active sessions!"</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    {move ||
        if contains_create(){
            view!{cx, <CreateToken />}.into_view(cx)
        }else{
            ().into_view(cx)
        }
    }
        }
}
