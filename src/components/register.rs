use crate::utils::modal::toggle_modal;
use leptos::*;
use leptos_meta::*;

/// Renders the home page of your application.
#[component]
pub fn RegisterPage(cx: Scope) -> impl IntoView {
    provide_meta_context(cx);
    // Creates a reactive value to update the button

    let toggle_mod = move |_| toggle_modal("registerModal");

    view! {cx,
        // <div class="card m-3 w-75 p-4">
        //     <div class="card-body">
        //         <div class="alert alert-info" role="alert">
        //         <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 8l.01 0" /><path d="M11 12l1 0l0 4l1 0" /></svg>

        //         <h4 class="alert-title">"Registration required"</h4>
        //         <div class="text-muted">"You must register with an display name first. Afterwards your account must be unlocked by an admin."</div>
        //         </div>
        //         <div class="input-group">
        //             <span class="input-group-text" id="basic-addon3">"Display Name"</span>
        //             <input type="text" class="form-control" id="basic-url" v-model="field" aria-describedby="basic-addon3" />
        //             <button class="btn btn-outline-success" type="button" id="button-addon2">"Register"</button>
        //         </div>
        //     </div>
        // </div>

                <button type="button" class="btn btn-primary" on:click=toggle_mod>
                "Launch modal with form"
                </button>

                <div class="modal" id="registerModal" tabindex="-1">
                    <div class="modal-dialog modal-sm" role="document">
                        <div class="modal-content">
                            <div class="modal-status bg-info"></div>


                            <div class="modal-body">

                                <div class="text-center py-4">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-api-app mb-2 text-blue icon-lg" width="40" height="40" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                        <path d="M12 15h-6.5a2.5 2.5 0 1 1 0 -5h.5"></path>
                                        <path d="M15 12v6.5a2.5 2.5 0 1 1 -5 0v-.5"></path>
                                        <path d="M12 9h6.5a2.5 2.5 0 1 1 0 5h-.5"></path>
                                        <path d="M9 12v-6.5a2.5 2.5 0 0 1 5 0v.5"></path>
                                    </svg>
                                    <h3>"Registration required!"</h3>
                                    <div class="text-muted">"Your account is not yet registered, please register first before you can proceed!"</div>
                                </div>
                                <div class="mx-auto">
                                    <div class="mb-3">
                                        <label class="form-label text-left">"Displayname"</label>
                                        <input type="text" class="form-control flex-fill" name="displayname" placeholder="" />
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label text-left">"Email (optional)"</label>
                                        <input type="text" class="form-control flex-fill" name="email" placeholder="" />
                                    </div>
                                </div>
                            </div>

                            <div class="modal-footer">
                                <a href="#" class="btn" data-bs-dismiss="modal">
                                "Cancel"
                                </a>
                                <a href="#" class="btn btn-primary ms-auto" data-bs-dismiss="modal">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-plus" width="24" height="24" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                    <path d="M12 5l0 14"></path>
                                    <path d="M5 12l14 0"></path>
                                </svg>
                                "Register"
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
    }
}
