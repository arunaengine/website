use leptos::*;

#[component]
pub fn PanelContent() -> impl IntoView {
    view! {
        <div class="page-body">
            <div class="card text-start mt-3 col-6 mx-auto">
                <div class="card-body">
                    <h3 class="card-title text-center">
                        <b>"News & Updates"</b>
                    </h3>
                    <ul class="timeline">
                        <li class="timeline-event">
                            <div class="timeline-event-icon bg-yellow">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="icon icon-tabler icon-tabler-info-hexagon fw-bolder"
                                    width="40"
                                    height="40"
                                    viewBox="0 0 24 24"
                                    stroke-width="2"
                                    stroke="currentColor"
                                    fill="none"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                    <path d="M19.875 6.27c.7 .398 1.13 1.143 1.125 1.948v7.284c0 .809 -.443 1.555 -1.158 1.948l-6.75 4.27a2.269 2.269 0 0 1 -2.184 0l-6.75 -4.27a2.225 2.225 0 0 1 -1.158 -1.948v-7.285c0 -.809 .443 -1.554 1.158 -1.947l6.75 -3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98h-.033z"></path>
                                    <path d="M12 9h.01"></path>
                                    <path d="M11 12h1v4h1"></path>
                                </svg>
                            </div>
                            <div class="card timeline-event-card">
                                <div class="card-body">
                                    <div class="text-muted float-end">""</div>
                                    <h4>"Important Note"</h4>
                                    <p>
                                        <div class="text-muted">
                                            "Please note that this website is heavily work in progress and besides "
                                            <b>"token creation"</b> " entirely optional."
                                        </div>
                                        <div class="text-muted">
                                            "Expect visual bugs, glitches and issues. We are actively working on improving the user experience and hope to release further updates soon."
                                        </div>
                                        <div class="text-muted">
                                            "If you have any issues, especially regarding the API-Token creation please open an issue at:"
                                        </div>
                                    </p>
                                    <p class="text-muted">
                                        <a href="https://github.com/ArunaStorage/ArunaWeb">
                                            "https://github.com/ArunaStorage/ArunaWeb"
                                        </a>
                                        " or write an email to "
                                        <a href="mailto:support@aruna-storage.org">
                                            "support@aruna-storage.org"
                                        </a>
                                    </p>
                                </div>
                            </div>
                        </li>
                        <li class="timeline-event">
                            <div class="timeline-event-icon bg-success fw-bolder">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="icon icon-tabler icon-tabler-confetti"
                                    width="40"
                                    height="40"
                                    viewBox="0 0 24 24"
                                    stroke-width="2"
                                    stroke="currentColor"
                                    fill="none"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                    <path d="M4 5h2"></path>
                                    <path d="M5 4v2"></path>
                                    <path d="M11.5 4l-.5 2"></path>
                                    <path d="M18 5h2"></path>
                                    <path d="M19 4v2"></path>
                                    <path d="M15 9l-1 1"></path>
                                    <path d="M18 13l2 -.5"></path>
                                    <path d="M18 19h2"></path>
                                    <path d="M19 18v2"></path>
                                    <path d="M14 16.518l-6.518 -6.518l-4.39 9.58a1 1 0 0 0 1.329 1.329l9.579 -4.39z"></path>
                                </svg>
                            </div>
                            <div class="card timeline-event-card">
                                <div class="card-body">
                                    <div class="text-muted float-end">"21.04.23"</div>
                                    <h4>"v1.0.0 Release"</h4>
                                    <p>
                                        <div class="text-muted">
                                            "We are proud to announce the official release of Aruna 1.0.0"
                                        </div>
                                        <div class="text-muted">
                                            "This update adds many long awaited updates. For full changelogs see:"
                                        </div>
                                    </p>
                                    <p>
                                        <div class="text-muted">
                                            <b>"API: "</b>
                                            <a href="https://github.com/ArunaStorage/ArunaAPI/releases/tag/v1.0.0">
                                                "API Release / Changelog"
                                            </a>
                                        </div>
                                        <div class="text-muted">
                                            <b>"Server: "</b>
                                            <a href="https://github.com/ArunaStorage/ArunaServer/releases/tag/v1.0.0">
                                                "Server Changelog"
                                            </a>
                                        </div>
                                        <div class="text-muted">
                                            <b>"Dataproxy: "</b>
                                            <a href="https://github.com/ArunaStorage/DataProxy/releases/tag/v1.0.0">
                                                "Dataproxy Changelog"
                                            </a>
                                        </div>
                                    </p>
                                    <p>
                                        <div class="text-muted">
                                            "As always, if you have any problems or issues, contact us or create an issue on GitHub."
                                        </div>
                                    </p>
                                </div>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    }
}
