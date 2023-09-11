use leptos::{html::Div, *};
use leptos_router::*;

#[server(SendMail, "/api")]
pub async fn send_mail(mail: String) -> Result<(), ServerFnError> {
    use crate::utils::mail::MailClient;
    let state: MailClient = use_context::<MailClient>()
        .ok_or(ServerFnError::ServerError("No server state".to_string()))?;

    state
        .send_message(
            "mailing-list@aruna-storage.org",
            mail,
            "A new member in the mailing-list",
        )
        .map_err(|_| ServerFnError::ServerError("Failed to send mail".to_string()))
}

/// Renders the home page of your application.
#[component]
pub fn MainBody() -> impl IntoView {
    let hook = move || {
        view! {
            <div class="px-4 pt-5 my-5 mt-6 text-center">
                <div class="overflow-hidden" style="max-height: 30vh;">
                    <div class="container px-5">
                        <img
                            src="/aruna_light.png"
                            class="img-fluid mb-4 hide-theme-dark"
                            alt="Aruna Logo"
                            width="700"
                            height="500"
                        />
                        <img
                            src="/aruna_dark.png"
                            class="img-fluid mb-4 hide-theme-light"
                            alt="Aruna Logo"
                            width="700"
                            height="500"
                        />
                    </div>
                </div>
                <h1 class="fw-bold hook pb-2">{"Your distributed scientific data mesh"}</h1>
                <div class="col-lg-10 mx-auto">
                    <h3 class="lead mb-4">
                        {"Fast, secure, distributed and domain-agnostic data storage with sophisticated metadata management according to "}
                        <a class="text-primary" href="https://www.go-fair.org/fair-principles/">{"FAIR"}</a>
                        {" principles. Store and organize your data in new ways, share it with your colleagues and partners. Transparent data management made easy."}
                    </h3>
                    <div class="d-grid gap-2 d-sm-flex justify-content-sm-center">
                        <button
                            type="button"
                            class="btn btn-primary btn-lg px-4 me-sm-3"
                            on:click=move |_| {
                                let _ = window()
                                    .location()
                                    .set_href("https://arunastorage.github.io/Documentation");
                            }
                        >

                            {"Learn more!"}
                        </button>
                        <button
                            type="button"
                            class="btn btn-outline-secondary btn-lg px-4"
                            on:click=move |_| {
                                let _ = window()
                                    .location()
                                    .set_href("mailto:support@aruna-storage.org");
                            }
                        >

                            {"Contact us"}
                        </button>
                    </div>
                </div>
            </div>
        }
    };

    let section1 = move || {
        view! {
            <div>
                <div class="mb-3 mt-5 container">
                    <div class="row items-center text-center d-flex">
                        <div class="col-sm">
                            <div class="shape shape-primary shape-md mb-3">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="icon icon-tabler icon-tabler-brand-github icon"
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    stroke-width="2"
                                    stroke="currentColor"
                                    fill="none"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5"></path>
                                </svg>
                            </div>
                            <h2 class="h3">{"Free and open source"}</h2>
                            <p class="text-muted">
                                {"Public money, public code, host your own instance as you like or contribute to the community."}
                            </p>
                        </div>
                        <div class="col-sm">
                            <div class="shape shape-primary shape-md mb-3">
                                <svg
                                    class="icon icon-tabler icon"
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    fill="none"
                                >
                                    <path d="M23.687 11.709l-.995-.616a13.559 13.559 0 0 0-.028-.29l.855-.797a.344.344 0 0 0-.114-.571l-1.093-.409a8.392 8.392 0 0 0-.086-.282l.682-.947a.342.342 0 0 0-.223-.538l-1.152-.187a9.243 9.243 0 0 0-.139-.259l.484-1.063c.05-.108.039-.234-.027-.332s-.178-.156-.297-.152l-1.17.041a6.662 6.662 0 0 0-.185-.224l.269-1.139a.343.343 0 0 0-.412-.412l-1.139.269a13.847 13.847 0 0 0-.225-.185l.041-1.17a.34.34 0 0 0-.484-.324l-1.063.485c-.086-.047-.172-.094-.259-.139l-.188-1.153a.344.344 0 0 0-.538-.223l-.948.682a8.383 8.383 0 0 0-.282-.085L14.562.596a.344.344 0 0 0-.571-.114l-.797.856a9.18 9.18 0 0 0-.29-.028l-.616-.995a.342.342 0 0 0-.582 0l-.616.995c-.097.008-.194.018-.29.028l-.798-.856a.342.342 0 0 0-.571.114l-.409 1.093c-.095.027-.188.056-.282.085l-.947-.682a.344.344 0 0 0-.538.223l-.188 1.153a9.243 9.243 0 0 0-.259.139l-1.063-.485a.342.342 0 0 0-.484.324l.041 1.17c-.076.06-.151.122-.225.185l-1.139-.269a.343.343 0 0 0-.412.412l.268 1.139c-.062.074-.124.149-.184.224l-1.17-.041a.342.342 0 0 0-.324.484l.485 1.063a9.055 9.055 0 0 0-.139.259l-1.152.187a.344.344 0 0 0-.223.538l.682.947c-.03.094-.058.187-.086.282L.59 9.435a.344.344 0 0 0-.114.571l.855.797a9.18 9.18 0 0 0-.028.29l-.995.616a.34.34 0 0 0 0 .582l.995.616c.008.097.018.194.028.29l-.855.798a.342.342 0 0 0 .114.571l1.093.409c.027.095.056.189.086.282l-.682.947a.341.341 0 0 0 .224.538l1.152.187c.045.087.091.173.139.259l-.485 1.063a.342.342 0 0 0 .324.484l1.169-.041c.061.076.122.151.185.225l-.268 1.14a.342.342 0 0 0 .412.411l1.139-.268c.074.063.149.124.225.184l-.041 1.17a.34.34 0 0 0 .484.323l1.063-.484c.086.048.172.094.259.139l.188 1.152a.344.344 0 0 0 .538.224l.947-.682c.094.03.187.059.282.086l.409 1.093a.341.341 0 0 0 .571.114l.798-.855c.096.011.193.02.29.029l.616.995a.343.343 0 0 0 .582 0l.616-.995c.097-.009.194-.018.29-.029l.797.855a.344.344 0 0 0 .571-.114l.409-1.093c.095-.027.189-.056.282-.086l.947.682a.341.341 0 0 0 .538-.224l.188-1.152c.087-.045.173-.092.259-.139l1.063.484a.343.343 0 0 0 .484-.323l-.041-1.17c.076-.06.151-.121.224-.184l1.139.268a.343.343 0 0 0 .412-.411l-.268-1.14c.062-.074.124-.149.184-.225l1.17.041a.34.34 0 0 0 .324-.484l-.484-1.063c.047-.086.094-.172.139-.259l1.152-.187a.344.344 0 0 0 .223-.538l-.682-.947.086-.282 1.093-.409a.342.342 0 0 0 .114-.571l-.855-.798c.01-.096.02-.193.028-.29l.995-.616a.34.34 0 0 0 0-.582zm-6.659 8.253a.705.705 0 0 1 .295-1.379.705.705 0 1 1-.296 1.379zm-.338-2.286a.641.641 0 0 0-.762.494l-.353 1.648c-1.09.495-2.3.77-3.575.77a8.63 8.63 0 0 1-3.65-.804l-.353-1.648a.64.64 0 0 0-.762-.493l-1.455.312a8.615 8.615 0 0 1-.752-.887h7.08c.08 0 .134-.014.134-.087v-2.505c0-.073-.053-.087-.134-.087h-2.071v-1.588h2.24c.204 0 1.093.058 1.377 1.194.089.349.284 1.486.418 1.85.133.408.675 1.223 1.253 1.223h3.528a.74.74 0 0 0 .128-.013 8.68 8.68 0 0 1-.802.941l-1.489-.32zm-9.793 2.252a.705.705 0 1 1-.296-1.379.705.705 0 0 1 .296 1.379zM4.211 9.036a.705.705 0 1 1-1.288.572.705.705 0 0 1 1.288-.572zm-.825 1.957l1.516-.674a.642.642 0 0 0 .326-.848l-.312-.706h1.228v5.534H3.667a8.668 8.668 0 0 1-.28-3.307zm6.652-.537V8.825h2.924c.151 0 1.066.175 1.066.859 0 .568-.702.772-1.279.772h-2.711zm10.626 1.468c0 .216-.008.431-.024.643h-.889c-.089 0-.125.058-.125.146v.408c0 .961-.542 1.17-1.017 1.223-.452.051-.953-.189-1.015-.466-.267-1.5-.711-1.821-1.413-2.374.871-.553 1.777-1.369 1.777-2.461 0-1.179-.809-1.922-1.36-2.287-.773-.51-1.629-.612-1.86-.612H5.545a8.658 8.658 0 0 1 4.847-2.736l1.084 1.137a.64.64 0 0 0 .907.021l1.212-1.16a8.668 8.668 0 0 1 5.931 4.224l-.83 1.875a.644.644 0 0 0 .326.848l1.598.71c.028.284.042.57.042.861zm-9.187-9.482a.703.703 0 1 1 .972 1.019.705.705 0 0 1-.972-1.019zm8.237 6.628c.157-.356.573-.516.928-.358a.705.705 0 1 1-.929.359z"></path>
                                </svg>
                            </div>
                            <h2 class="h3">{"Build with Rust"}</h2>
                            <p class="text-muted">
                                {"Strong commitment for fast, safe and reliable code. In the backend and the frontend."}
                            </p>
                        </div>
                        <div class="col-sm">
                            <div class="shape shape-primary shape-md mb-3">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="icon icon-tabler icon-tabler-hexagons"
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    stroke-width="2"
                                    stroke="currentColor"
                                    fill="none"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                    <path d="M4 18v-5l4 -2l4 2v5l-4 2z"></path>
                                    <path d="M8 11v-5l4 -2l4 2v5"></path>
                                    <path d="M12 13l4 -2l4 2v5l-4 2l-4 -2"></path>
                                </svg>
                            </div>
                            <h2 class="h3">{"Modular design"}</h2>
                            <p class="text-muted">
                                {"A modern microservice architecture allows us to deploy only the components you need, without unnecessary overhead"}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        }
    };

    let section2 = move || {
        view! {
            <div class="row">
                <div class="card text-start px-4 py-5 col-lg-12" id="icon-grid">
                    <div class="row">
                        <div class="col-xl-6">
                            <div
                                class="col d-flex align-items-start border-opacity-50 shadow-sm px-3 py-3 mb-2"
                                style="border: 1px dashed #999"
                            >
                                <div class="text-body-emphasis d-inline-flex align-self-center flex-shrink-0 me-3">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="48"
                                        height="48"
                                        fill="#888"
                                        class="bi bi-database m-auto"
                                        viewBox="0 0 16 16"
                                    >
                                        <path d="M4.318 2.687C5.234 2.271 6.536 2 8 2s2.766.27 3.682.687C12.644 3.125 13 3.627 13 4c0 .374-.356.875-1.318 1.313C10.766 5.729 9.464 6 8 6s-2.766-.27-3.682-.687C3.356 4.875 3 4.373 3 4c0-.374.356-.875 1.318-1.313ZM13 5.698V7c0 .374-.356.875-1.318 1.313C10.766 8.729 9.464 9 8 9s-2.766-.27-3.682-.687C3.356 7.875 3 7.373 3 7V5.698c.271.202.58.378.904.525C4.978 6.711 6.427 7 8 7s3.022-.289 4.096-.777A4.92 4.92 0 0 0 13 5.698ZM14 4c0-1.007-.875-1.755-1.904-2.223C11.022 1.289 9.573 1 8 1s-3.022.289-4.096.777C2.875 2.245 2 2.993 2 4v9c0 1.007.875 1.755 1.904 2.223C4.978 15.71 6.427 16 8 16s3.022-.289 4.096-.777C13.125 14.755 14 14.007 14 13V4Zm-1 4.698V10c0 .374-.356.875-1.318 1.313C10.766 11.729 9.464 12 8 12s-2.766-.27-3.682-.687C3.356 10.875 3 10.373 3 10V8.698c.271.202.58.378.904.525C4.978 9.71 6.427 10 8 10s3.022-.289 4.096-.777A4.92 4.92 0 0 0 13 8.698Zm0 3V13c0 .374-.356.875-1.318 1.313C10.766 14.729 9.464 15 8 15s-2.766-.27-3.682-.687C3.356 13.875 3 13.373 3 13v-1.302c.271.202.58.378.904.525C4.978 12.71 6.427 13 8 13s3.022-.289 4.096-.777c.324-.147.633-.323.904-.525Z"></path>
                                    </svg>
                                </div>
                                <div>
                                    <h3 class="fw-bold mb-0 mt-1">{"Data storage"}</h3>
                                    <p class="text-muted mb-1">
                                        {"Store data regardless of format or size, use our managed service, or join the network with a self-hosted proxy instance."}
                                    </p>
                                </div>
                            </div>

                            <div
                                class="col d-flex align-items-start border-opacity-50 shadow-sm px-3 py-3 my-2"
                                style="border: 1px dashed #999"
                            >
                                <div class="text-body-emphasis d-inline-flex align-self-center flex-shrink-0 me-3">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="48"
                                        height="48"
                                        fill="#888"
                                        class="bi bi-file-earmark-medical m-auto"
                                        viewBox="0 0 16 16"
                                    >
                                        <path d="M7.5 5.5a.5.5 0 0 0-1 0v.634l-.549-.317a.5.5 0 1 0-.5.866L6 7l-.549.317a.5.5 0 1 0 .5.866l.549-.317V8.5a.5.5 0 1 0 1 0v-.634l.549.317a.5.5 0 1 0 .5-.866L8 7l.549-.317a.5.5 0 1 0-.5-.866l-.549.317V5.5zm-2 4.5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5zm0 2a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5z"></path>
                                        <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"></path>
                                    </svg>
                                </div>
                                <div>
                                    <h3 class="fw-bold mb-0 mt-1">{"Metadata enrichment"}</h3>
                                    <p class="text-muted mb-1">
                                        {"Enrich, group, and organize data and metadata, including qualified links to internal and external sources, thanks to a flexible and powerful multi-standard metadata management system."}
                                    </p>
                                </div>
                            </div>

                            <div
                                class="col d-flex align-items-start border-opacity-50 shadow-sm px-3 py-3 my-2"
                                style="border: 1px dashed #999"
                            >
                                <div class="text-body-emphasis d-inline-flex align-self-center flex-shrink-0 me-3">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="48"
                                        height="48"
                                        fill="#888"
                                        class="bi bi-search mx-auto my-auto"
                                        viewBox="0 0 16 16"
                                    >
                                        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"></path>
                                    </svg>
                                </div>
                                <div>
                                    <h3 class="fw-bold mb-0 mt-1">{"FAIR"}</h3>
                                    <p class="text-muted mb-1">
                                        {"All data is treated similarly to FAIR Digital Objects, with a globally unique persistent identifier for each resource and qualified (user-defined) relationships to internal and external sources."}
                                    </p>
                                </div>
                            </div>

                            <div
                                class="col d-flex align-items-start border-opacity-50 shadow-sm px-3 py-3 my-2"
                                style="border: 1px dashed #999"
                            >
                                <div class="text-body-emphasis d-inline-flex align-self-center flex-shrink-0 me-3">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="48"
                                        height="48"
                                        fill="#888"
                                        class="bi bi-share mx-auto my-auto"
                                        viewBox="0 0 16 16"
                                    >
                                        <path d="M13.5 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.499 2.499 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5zm-8.5 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm11 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"></path>
                                    </svg>
                                </div>
                                <div>
                                    <h3 class="fw-bold mb-0 mt-1">{"Easy Sharing"}</h3>
                                    <p class="text-muted mb-1">
                                        {"Flexible data handling via the widely accepted S3 compatible interface, including pre-authenticated up- and download URLs makes it easy to integrate with existing tools and workflows."}
                                    </p>
                                </div>
                            </div>

                            <div
                                class="col d-flex align-items-start border-opacity-50 shadow-sm px-3 py-3 mt-2"
                                style="border: 1px dashed #999"
                            >
                                <div class="text-body-emphasis d-inline-flex align-self-center flex-shrink-0 me-3">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="48"
                                        height="48"
                                        fill="#888"
                                        class="bi bi-rocket-takeoff mx-auto my-auto"
                                        viewBox="0 0 16 16"
                                    >
                                        <path d="M9.752 6.193c.599.6 1.73.437 2.528-.362.798-.799.96-1.932.362-2.531-.599-.6-1.73-.438-2.528.361-.798.8-.96 1.933-.362 2.532Z"></path>
                                        <path d="M15.811 3.312c-.363 1.534-1.334 3.626-3.64 6.218l-.24 2.408a2.56 2.56 0 0 1-.732 1.526L8.817 15.85a.51.51 0 0 1-.867-.434l.27-1.899c.04-.28-.013-.593-.131-.956a9.42 9.42 0 0 0-.249-.657l-.082-.202c-.815-.197-1.578-.662-2.191-1.277-.614-.615-1.079-1.379-1.275-2.195l-.203-.083a9.556 9.556 0 0 0-.655-.248c-.363-.119-.675-.172-.955-.132l-1.896.27A.51.51 0 0 1 .15 7.17l2.382-2.386c.41-.41.947-.67 1.524-.734h.006l2.4-.238C9.005 1.55 11.087.582 12.623.208c.89-.217 1.59-.232 2.08-.188.244.023.435.06.57.093.067.017.12.033.16.045.184.06.279.13.351.295l.029.073a3.475 3.475 0 0 1 .157.721c.055.485.051 1.178-.159 2.065Zm-4.828 7.475.04-.04-.107 1.081a1.536 1.536 0 0 1-.44.913l-1.298 1.3.054-.38c.072-.506-.034-.993-.172-1.418a8.548 8.548 0 0 0-.164-.45c.738-.065 1.462-.38 2.087-1.006ZM5.205 5c-.625.626-.94 1.351-1.004 2.09a8.497 8.497 0 0 0-.45-.164c-.424-.138-.91-.244-1.416-.172l-.38.054 1.3-1.3c.245-.246.566-.401.91-.44l1.08-.107-.04.039Zm9.406-3.961c-.38-.034-.967-.027-1.746.163-1.558.38-3.917 1.496-6.937 4.521-.62.62-.799 1.34-.687 2.051.107.676.483 1.362 1.048 1.928.564.565 1.25.941 1.924 1.049.71.112 1.429-.067 2.048-.688 3.079-3.083 4.192-5.444 4.556-6.987.183-.771.18-1.345.138-1.713a2.835 2.835 0 0 0-.045-.283 3.078 3.078 0 0 0-.3-.041Z"></path>
                                        <path d="M7.009 12.139a7.632 7.632 0 0 1-1.804-1.352A7.568 7.568 0 0 1 3.794 8.86c-1.102.992-1.965 5.054-1.839 5.18.125.126 3.936-.896 5.054-1.902Z"></path>
                                    </svg>
                                </div>
                                <div>
                                    <h3 class="fw-bold mb-0 mt-1">{"Effortless Migration"}</h3>
                                    <p class="text-muted">
                                        {"Existing storage systems can be easily integrated into the system without moving any data. You maintain full control over who has access to your data."}
                                    </p>
                                </div>
                            </div>
                            <div
                                class="col d-flex align-items-start border-opacity-50 shadow-sm px-3 py-3 mt-2"
                                style="border: 1px dashed #999"
                            >
                                <div class="text-body-emphasis d-inline-flex align-self-center flex-shrink-0 me-3">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="48"
                                        height="48"
                                        fill="#888"
                                        class="bi bi-shield-lock m-auto"
                                        viewBox="0 0 16 16"
                                    >
                                        <path d="M5.338 1.59a61.44 61.44 0 0 0-2.837.856.481.481 0 0 0-.328.39c-.554 4.157.726 7.19 2.253 9.188a10.725 10.725 0 0 0 2.287 2.233c.346.244.652.42.893.533.12.057.218.095.293.118a.55.55 0 0 0 .101.025.615.615 0 0 0 .1-.025c.076-.023.174-.061.294-.118.24-.113.547-.29.893-.533a10.726 10.726 0 0 0 2.287-2.233c1.527-1.997 2.807-5.031 2.253-9.188a.48.48 0 0 0-.328-.39c-.651-.213-1.75-.56-2.837-.855C9.552 1.29 8.531 1.067 8 1.067c-.53 0-1.552.223-2.662.524zM5.072.56C6.157.265 7.31 0 8 0s1.843.265 2.928.56c1.11.3 2.229.655 2.887.87a1.54 1.54 0 0 1 1.044 1.262c.596 4.477-.787 7.795-2.465 9.99a11.775 11.775 0 0 1-2.517 2.453 7.159 7.159 0 0 1-1.048.625c-.28.132-.581.24-.829.24s-.548-.108-.829-.24a7.158 7.158 0 0 1-1.048-.625 11.777 11.777 0 0 1-2.517-2.453C1.928 10.487.545 7.169 1.141 2.692A1.54 1.54 0 0 1 2.185 1.43 62.456 62.456 0 0 1 5.072.56z"></path>
                                        <path d="M9.5 6.5a1.5 1.5 0 0 1-1 1.415l.385 1.99a.5.5 0 0 1-.491.595h-.788a.5.5 0 0 1-.49-.595l.384-1.99a1.5 1.5 0 1 1 2-1.415z"></path>
                                    </svg>
                                </div>
                                <div>
                                    <h3 class="fw-bold mb-0 mt-1">{"Secure Storage"}</h3>
                                    <p class="text-muted mb-1">
                                        {"Secure managed data storage with advanced encryption from the moment of upload."}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div
                            class="d-inline-flex col-xl-6 border-opacity-50"
                            style="border: 1px dashed #999;"
                        >
                            <img
                                src="/aruna_schematic.png"
                                class="img-fluid my-auto"
                                alt="ConceptAruna"
                            />
                        </div>
                    </div>
                </div>
            </div>
        }
    };

    let send_mail = create_server_action::<SendMail>();

    let succeeded = move || send_mail.value()().map(|e| e.ok()).flatten().is_some();

    let timeline = move || {
        view! {
            <div class="row">
                <div class="card text-start col-lg-12" id="timeline">
                    <div class="card-header">
                        <span class="text-white avatar bg-primary me-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-info-square" width="40" height="40" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M12 9h.01"></path>
                                <path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14z"></path>
                                <path d="M11 12h1v4h1"></path>
                            </svg>
                        </span>
                        <h3 class="h2 card-text text-left ms-2 text-primary">
                            <b>"News & Updates"</b>
                        </h3>
                    </div>
                    <div class="card-body">
                        <ul class="timeline">
                            <li class="timeline-event">
                                <div class="text-white timeline-event-icon bg-primary">
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
                                        <h3 class="h2">"🎉 Version 2.0.0 is coming soon!"</h3>
                                        <p>
                                            <div class="text-muted">
                                                <p>
                                                    <div>"We are very happy to anounce that the next major version of Aruna is scheduled for release on "<b>"02.10.2023"</b></div>
                                                    <div>"This will integrate many long awaited features and improvements. Such as:"</div>
                                                </p>
                                                <p>
                                                    <div><b>"- Relaxed hierarchy: "</b>"You can now arrange your objects in a tree-like structure without the requirement for intermediate collections."</div>
                                                    <div><b>"- Improved search: "</b>"A new typo-tolerant metadata search with advanced query capabilities"</div>
                                                    <div><b>"- Hooks: "</b>"Automated actions on object creation for data transformation and validation"</div>
                                                    <div><b>"- Improved web interface: "</b>"You can explore the preview "<A href="/dash/search">here</A> "!"</div>
                                                    <div><b>"- Data proxy overhaul: "</b>"Data proxies have been completely redesigned to separate"</div>
                                                    <div><b>"- Fine grained user permissions: "</b>"A new attribute based user permission system has been added"</div>
                                                    <div><b>"- and a lot more..."</b></div>
                                                </p>
                                                <p>
                                                    <div><b>"We have temporarily disabled new user registrations and logins to prepare for the update. Existing users can still log in and use the system as usual."</b></div>
                                                </p>
                                                <p>
                                                    <div>"Stay tuned for the upcoming update and join our mailing list here:"</div>
                                                </p>
                                            </div>
                                        </p>
                                    </div>
                                </div>
                            </li>
                            <li class="timeline-event">
                                <div class="timeline-event-icon text-white bg-primary fw-bolder">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-mail-check" width="40" height="40" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                        <path d="M11 19h-6a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v6"></path>
                                        <path d="M3 7l9 6l9 -6"></path>
                                        <path d="M15 19l2 2l4 -4"></path>
                                    </svg>
                                </div>
                                <div class="card timeline-event-card">
                                    <div class="card-body">
                                        //<div class="text-muted float-end">"21.04.23"</div>
                                        <h3 class="h2">"Join our mailing list"</h3>
                                        <div class="text-muted">
                                            <p>
                                                <div>
                                                    "If you want to stay up to date with the latest news and updates, you can now join our mailing list."
                                                </div>
                                            </p>
                                        </div>

                                        <div class="container p-1">

                                            <ActionForm action=send_mail class="row">
                                                <input type="email" class="form-control col-6 w-25" name="mail" aria-describedby="emailHelp" placeholder="Enter email" />
                                                <button type="submit" class="btn btn-primary col-1">Join</button>
                                                { move || if succeeded() {
                                                    view! {
                                                        <div class="alert alert-success col-5" role="alert">
                                                            "Success ! Thank you for joining our mailing list!"
                                                        </div>
                                                    }.into_view()
                                                }else{
                                                    ().into_view()
                                                }
                                                }
                                                <div id="emailHelp" class="form-text">"We'll never share your email with anyone else. Click "<A href="/imprint"> "here" </A> " to learn how we store and process your data."</div>
                                            </ActionForm>
                                        </div>
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        }
    };

    let faq = move || {
        view! {
            <div class="row">
                <div class="card card-lg text-start col-lg-12">
                    <div class="card-header">
                        <span class="text-white avatar bg-primary me-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-help-hexagon" width="40" height="40" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M19.875 6.27c.7 .398 1.13 1.143 1.125 1.948v7.284c0 .809 -.443 1.555 -1.158 1.948l-6.75 4.27a2.269 2.269 0 0 1 -2.184 0l-6.75 -4.27a2.225 2.225 0 0 1 -1.158 -1.948v-7.285c0 -.809 .443 -1.554 1.158 -1.947l6.75 -3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98h-.033z"></path>
                                <path d="M12 16v.01"></path>
                                <path d="M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483"></path>
                            </svg>
                        </span>
                        <h3 class="h2 card-text text-primary text-left ms-2">
                            <b>"FAQ"</b>
                        </h3>
                    </div>
                    <div class="card-body p-4">
                            <div>
                                <h2 class="mb-3">{"1. Introduction"}</h2>
                                <div
                                    id="faq-1"
                                    class="accordion"
                                    role="tablist"
                                    aria-multiselectable="true"
                                >
                                    <div class="accordion-item">
                                        <div class="accordion-header" role="tab">
                                            <button
                                                class="accordion-button"
                                                data-bs-toggle="collapse"
                                                data-bs-target="#faq-1-1"
                                            >
                                                {"What is Aruna ?"}
                                            </button>
                                        </div>
                                        <div
                                            id="faq-1-1"
                                            class="accordion-collapse collapse show"
                                            role="tabpanel"
                                            data-bs-parent="#faq-1"
                                        >
                                            <div class="accordion-body pt-0">
                                                <div>
                                                    <p>
                                                        {"Aruna Object Storage (AOS) is an open source data storage platform that enables scientists to store, annotate and share their data according to "}
                                                        <a href="https://www.go-fair.org/fair-principles/">
                                                            {"FAIR"}
                                                        </a> {" principles."}
                                                    </p>
                                                    <p>
                                                        {"The name Aruna originates from the god of the sea in hittite mythology and their name for the sea and bodies of water in general.
                                                        We choose this name to symbolize our vision of a revolutionary cloud-native data lake."}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="accordion-item">
                                        <div class="accordion-header" role="tab">
                                            <button
                                                class="accordion-button collapsed"
                                                data-bs-toggle="collapse"
                                                data-bs-target="#faq-1-2"
                                            >
                                                {"Who are we?"}
                                            </button>
                                        </div>
                                        <div
                                            id="faq-1-2"
                                            class="accordion-collapse collapse"
                                            role="tabpanel"
                                            data-bs-parent="#faq-1"
                                        >
                                            <div class="accordion-body pt-0">
                                                <div>
                                                    <p>
                                                        {"Aruna is developed by a small team at "}
                                                        <a href="https://www.uni-giessen.de/de">
                                                            "Justus-Liebig-University Giessen"
                                                        </a>
                                                        {" for the NFDI4Biodiversity and NFDI4Microbiota projects, as well as the GAIA-X connector project FAIR-Dataspaces"}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="accordion-item">
                                        <div class="accordion-header" role="tab">
                                            <button
                                                class="accordion-button collapsed"
                                                data-bs-toggle="collapse"
                                                data-bs-target="#faq-1-3"
                                            >
                                                {"Why should I use Aruna for my project?"}
                                            </button>
                                        </div>
                                        <div
                                            id="faq-1-3"
                                            class="accordion-collapse collapse"
                                            role="tabpanel"
                                            data-bs-parent="#faq-1"
                                        >
                                            <div class="accordion-body pt-0">
                                                <div>
                                                    <p>
                                                        {"Storing data in localized domain specific data silos can limit collaboration, reuse, and analysis of data. The Aruna platform can bring great benefits for your research data such as improved collaboration, compliance with FAIR principles, scalability, data security, and easy integration with existing systems and workflow systems, ultimately accelerating scientific progress and improving research quality."}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="mt-2">
                                <h2 class="mb-3">{"2. Technical information"}</h2>
                                <div
                                    id="faq-2"
                                    class="accordion"
                                    role="tablist"
                                    aria-multiselectable="true"
                                >
                                    <div class="accordion-item">
                                        <div class="accordion-header" role="tab">
                                            <button
                                                class="accordion-button collapsed"
                                                data-bs-toggle="collapse"
                                                data-bs-target="#faq-2-2"
                                            >
                                                {"How can I log in?"}
                                            </button>
                                        </div>
                                        <div
                                            id="faq-2-2"
                                            class="accordion-collapse collapse"
                                            role="tabpanel"
                                            data-bs-parent="#faq-2"
                                        >
                                            <div class="accordion-body pt-0">
                                                <div>
                                                    <p>
                                                        {"Currently our service is an invitation only platform for members of the NFDI consortia. In the future we plan to open our platform for a broader audience."}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="accordion-item">
                                        <div class="accordion-header" role="tab">
                                            <button
                                                class="accordion-button collapsed"
                                                data-bs-toggle="collapse"
                                                data-bs-target="#faq-2-3"
                                            >
                                                {"How many projects can I create?"}
                                            </button>
                                        </div>
                                        <div
                                            id="faq-2-3"
                                            class="accordion-collapse collapse"
                                            role="tabpanel"
                                            data-bs-parent="#faq-2"
                                        >
                                            <div class="accordion-body pt-0">
                                                <div>
                                                    <p>
                                                        {"Projects are used to organize users on a per institution or research project basis. They are created on demand, contact us and we will figure out how to organize your specific request."}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="accordion-item">
                                        <div class="accordion-header" role="tab">
                                            <button
                                                class="accordion-button collapsed"
                                                data-bs-toggle="collapse"
                                                data-bs-target="#faq-2-4"
                                            >
                                                {"Is there a maximum storage capacity?"}
                                            </button>
                                        </div>
                                        <div
                                            id="faq-2-4"
                                            class="accordion-collapse collapse"
                                            role="tabpanel"
                                            data-bs-parent="#faq-2"
                                        >
                                            <div class="accordion-body pt-0">
                                                <div>
                                                    <p>
                                                        {"Currently we do not enforce storage quotas, but as always there is a physical limit in storage capacity. If you plan to store large amounts of data (>1 TB) contact us and we will figure out a solution."}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="accordion-item">
                                        <div class="accordion-header" role="tab">
                                            <button
                                                class="accordion-button collapsed"
                                                data-bs-toggle="collapse"
                                                data-bs-target="#faq-2-5"
                                            >
                                                {"Who can see my data?"}
                                            </button>
                                        </div>
                                        <div
                                            id="faq-2-5"
                                            class="accordion-collapse collapse"
                                            role="tabpanel"
                                            data-bs-parent="#faq-2"
                                        >
                                            <div class="accordion-body pt-0">
                                                <div>
                                                    <p>
                                                        {"You can choose how your data is shared, and we offer a variety of access models, from highly confidential data to public datasets that anyone can view and download. By default, all of your data is private and only accessible to the people you grant access to, but a minimal configurable set of metadata is always public to ensure discoverability."}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="accordion-item">
                                        <div class="accordion-header" role="tab">
                                            <button
                                                class="accordion-button collapsed"
                                                data-bs-toggle="collapse"
                                                data-bs-target="#faq-2-6"
                                            >
                                                {"Is my data secure?"}
                                            </button>
                                        </div>
                                        <div
                                            id="faq-2-6"
                                            class="accordion-collapse collapse"
                                            role="tabpanel"
                                            data-bs-parent="#faq-2"
                                        >
                                            <div class="accordion-body pt-0">
                                                <div>
                                                    <p>
                                                        {"When you use our managed service, we ensure that your data is stored through our custom data proxy component, which encrypts, compresses, and anonymizes all user-provided data by default. This way, your data is always secure while stored on disk."}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="accordion-item">
                                    <div class="accordion-header" role="tab">
                                        <button
                                            class="accordion-button collapsed"
                                            data-bs-toggle="collapse"
                                            data-bs-target="#faq-2-7"
                                        >
                                            {"What is a Dataproxy ?"}
                                        </button>
                                    </div>
                                    <div
                                        id="faq-2-7"
                                        class="accordion-collapse collapse"
                                        role="tabpanel"
                                        data-bs-parent="#faq-2"
                                    >
                                        <div class="accordion-body pt-0">
                                            <div>
                                                <p>
                                                    {"Data proxies are the decentralized backbone of the data plane, interacting directly with data storage providers and providing a unified S3-compliant interface for data. In addition, they can be configured to perform data encryption, compression, anonymization, and end-user access control, including enforcement of data usage policies."}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                </div>
                            </div>
                    </div>
                </div>
            </div>
        }
    };

    let partners = move || {
        view! {
            <div class="row d-flex items-center text-center align-items-center">
                <a class="col" href="https://www.nfdi4biodiversity.org/en/">
                    <div class="shape shape-primary shape-md mb-3">
                        <img
                            src="/biodiv.png"
                            class="img-fluid rounded-3 mb-4"
                            alt="Biodiv"
                            width="150"
                            height="100"
                        />
                    </div>
                </a>
                <a
                    class="col"
                    href="https://www.uni-giessen.de/de/fbz/fb08/Inst/bioinformatik/software/aruna"
                >
                    <div class="shape shape-primary shape-md mb-3">
                        <img
                            src="/jlu.png"
                            class="img-fluid rounded-3 mb-4"
                            alt="JLU"
                            width="150"
                            height="100"
                        />
                    </div>
                </a>
                <a class="col" href="https://elixir-europe.org/about-us/who-we-are/nodes/germany">
                    <div class="shape shape-primary shape-md mb-3">
                        <img
                            src="/elixir.png"
                            class="img-fluid rounded-3 mb-4"
                            alt="Elixir"
                            width="150"
                            height="100"
                        />
                    </div>
                </a>
                <a class="col" href="https://nfdi4microbiota.de/">
                    <div class="shape shape-primary shape-md mb-3">
                        <img
                            src="/microbiota.png"
                            class="img-fluid rounded-3 mb-4"
                            alt="Microbiota"
                            width="150"
                            height="100"
                        />
                    </div>
                </a>
                <a class="col" href="https://www.denbi.de/">
                    <div class="shape shape-primary shape-md mb-3">
                        <img
                            src="/denbi.svg"
                            class="img-fluid rounded-3 mb-4"
                            alt="deNBI"
                            width="150"
                            height="100"
                        />
                    </div>
                </a>
            </div>
        }
    };

    let bubbles = move || {
        view! {
            {(1..=12)
                .map(|x| {
                    view! { <div class=format!("bubble bubble--{x}")></div> }
                })
                .collect::<Vec<HtmlElement<Div>>>()}
        }
    };

    let waves = move || {
        view! {
            <div class="outer">
                <div class="wave"></div>
                <div class="wave"></div>
            </div>
        }
    };

    view! {
        <section class="section">
            <div class="container-xl">
                {hook}
            </div>
        </section>
        <section class="section">
            <div class="container-xl">
                {section1}
            </div>
            {waves}
        </section>
        <section class="section ocean-bg pb-4">
            <div class="container-xl">
                {section2}
            </div>
            {bubbles}
        </section>
        <section class="section pt-4 pb-4">
            <div class="container-xl">
                {timeline}
            </div>
        </section>
        <section id="faq" class="section pt-2 pb-4">
            <div class="container-xl">
                {faq}
            </div>
        </section>
        <section class="section">
            <div class="container-xl">
                {partners}
            </div>
        </section>
    }
}
