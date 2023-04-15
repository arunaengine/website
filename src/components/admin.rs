use leptos::*;
use leptos_meta::*;
use crate::utils::structs::UserState;
use crate::components::project::*;

#[component]
pub fn AdminOverview(cx: Scope) -> impl IntoView {
    provide_meta_context(cx);

    let get_user =
    use_context::<Resource<bool, Option<UserState>>>(cx).expect("user_state not set");


    let is_admin = create_memo(cx, move |_| {
        get_user.read(cx).unwrap_or_default().unwrap_or_default().is_admin
    });

    let permissions = create_memo(cx, move |_| {
        get_user.read(cx).unwrap_or_default().unwrap_or_default().permissions
    });

    if is_admin() == false {
        #[cfg(not(feature = "ssr"))]
        window().location().set_href("/").unwrap();
    }

    view! {cx,
    <div class="page-header d-print-none my-3">
        <div class="container-xl">
        <div class="row g-2 align-items-center">
            <div class="col">
            <h2 class="page-title">
                "Admin Panel!"
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
                        <th>"Name"</th>
                        <th>"Role"</th>
                        <th class="w-1">"Actions"</th>
                    </tr>
                    </thead>
                    <tbody>
                        <Transition fallback=move || view! { cx, <tr><td colspan="4" class="text-center"><div class="spinner-border"></div></td></tr> }>
                        {
                            move || if !permissions().is_empty() {
                                permissions().into_iter()
                                .map(|item| view! {
                                    cx,
                                    <Project project=item/>
                                })
                                .collect::<Vec<_>>().into_view(cx) 
                            }else{
                                view!{cx, <tr><td colspan="4" class="text-center">"Looks like you are currently not associated with any project!"</td></tr>}.into_view(cx)
                            }
                        }
                        </Transition>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    }
}
