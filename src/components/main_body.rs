use leptos::{html::Div, *};

/// Renders the home page of your application.
#[component]
pub fn MainBody(cx: Scope) -> impl IntoView {
    let hook = view!(cx,
        <div class="px-4 pt-5 my-5 text-center">
            <div class="overflow-hidden" style="max-height: 30vh;">
                <div class="container px-5">
                  <img src="/aruna_light.png" class="img-fluid mb-4 hide-theme-dark" alt="Aruna Logo" width="700" height="500" />
                  <img src="/aruna_dark.png" class="img-fluid mb-4 hide-theme-light" alt="Aruna Logo" width="700" height="500" />
                </div>
            </div>
            <h1 class="fw-bold hook pb-2">{"Your geo-redundant scientific data lake"}</h1>
            <div class="col-lg-6 mx-auto">
              <p class="mb-4 lead">{"Fast, secure, geo-redundant data storage with sophisticated metadata management according to "}<a href="https://www.go-fair.org/fair-principles/">{"FAIR"}</a>{" principles. Store and organize your data in new ways, share it with your colleagues and partners. Transparent data management made easy."}</p>
              <div class="d-grid gap-2 d-sm-flex justify-content-sm-center mb-5">
                <button type="button" class="btn btn-primary btn-lg px-4 me-sm-3">{"Get started!"}</button>
                <button type="button" class="btn btn-outline-secondary btn-lg px-4">{"Contact us"}</button>
              </div>
            </div>
          </div>
    );

    let bubbles = (1..=12)
        .map(|x| {
            view! {cx,
              <div class=format!("bubble bubble--{x}")></div>
            }
        })
        .collect::<Vec<HtmlElement<Div>>>();

    let section1 = view!(cx,
      <div>
            <div class="wave"></div>
            <div class="wave"></div>
            <div class="wave"></div>
            <div class="ocean"></div>
            {bubbles}
            <div class="mb-3 down container">
                <div class="row items-center text-center d-flex">
                    <div class="col-sm">
                        <div class="shape shape-primary shape-md mb-3">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-brand-github icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5"></path>
                            </svg>
                        </div>
                        <h2 class="h3">{"Free and open source"}</h2>
                        <p class="text-muted">{"Public money, public code, host your own instance as you like or contribute to the community."}
                        </p>
                    </div>
                    <div class="col-sm">
                        <div class="shape shape-primary shape-md mb-3">
                            <svg class="icon icon-tabler icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none">
                                <path d="M23.687 11.709l-.995-.616a13.559 13.559 0 0 0-.028-.29l.855-.797a.344.344 0 0 0-.114-.571l-1.093-.409a8.392 8.392 0 0 0-.086-.282l.682-.947a.342.342 0 0 0-.223-.538l-1.152-.187a9.243 9.243 0 0 0-.139-.259l.484-1.063c.05-.108.039-.234-.027-.332s-.178-.156-.297-.152l-1.17.041a6.662 6.662 0 0 0-.185-.224l.269-1.139a.343.343 0 0 0-.412-.412l-1.139.269a13.847 13.847 0 0 0-.225-.185l.041-1.17a.34.34 0 0 0-.484-.324l-1.063.485c-.086-.047-.172-.094-.259-.139l-.188-1.153a.344.344 0 0 0-.538-.223l-.948.682a8.383 8.383 0 0 0-.282-.085L14.562.596a.344.344 0 0 0-.571-.114l-.797.856a9.18 9.18 0 0 0-.29-.028l-.616-.995a.342.342 0 0 0-.582 0l-.616.995c-.097.008-.194.018-.29.028l-.798-.856a.342.342 0 0 0-.571.114l-.409 1.093c-.095.027-.188.056-.282.085l-.947-.682a.344.344 0 0 0-.538.223l-.188 1.153a9.243 9.243 0 0 0-.259.139l-1.063-.485a.342.342 0 0 0-.484.324l.041 1.17c-.076.06-.151.122-.225.185l-1.139-.269a.343.343 0 0 0-.412.412l.268 1.139c-.062.074-.124.149-.184.224l-1.17-.041a.342.342 0 0 0-.324.484l.485 1.063a9.055 9.055 0 0 0-.139.259l-1.152.187a.344.344 0 0 0-.223.538l.682.947c-.03.094-.058.187-.086.282L.59 9.435a.344.344 0 0 0-.114.571l.855.797a9.18 9.18 0 0 0-.028.29l-.995.616a.34.34 0 0 0 0 .582l.995.616c.008.097.018.194.028.29l-.855.798a.342.342 0 0 0 .114.571l1.093.409c.027.095.056.189.086.282l-.682.947a.341.341 0 0 0 .224.538l1.152.187c.045.087.091.173.139.259l-.485 1.063a.342.342 0 0 0 .324.484l1.169-.041c.061.076.122.151.185.225l-.268 1.14a.342.342 0 0 0 .412.411l1.139-.268c.074.063.149.124.225.184l-.041 1.17a.34.34 0 0 0 .484.323l1.063-.484c.086.048.172.094.259.139l.188 1.152a.344.344 0 0 0 .538.224l.947-.682c.094.03.187.059.282.086l.409 1.093a.341.341 0 0 0 .571.114l.798-.855c.096.011.193.02.29.029l.616.995a.343.343 0 0 0 .582 0l.616-.995c.097-.009.194-.018.29-.029l.797.855a.344.344 0 0 0 .571-.114l.409-1.093c.095-.027.189-.056.282-.086l.947.682a.341.341 0 0 0 .538-.224l.188-1.152c.087-.045.173-.092.259-.139l1.063.484a.343.343 0 0 0 .484-.323l-.041-1.17c.076-.06.151-.121.224-.184l1.139.268a.343.343 0 0 0 .412-.411l-.268-1.14c.062-.074.124-.149.184-.225l1.17.041a.34.34 0 0 0 .324-.484l-.484-1.063c.047-.086.094-.172.139-.259l1.152-.187a.344.344 0 0 0 .223-.538l-.682-.947.086-.282 1.093-.409a.342.342 0 0 0 .114-.571l-.855-.798c.01-.096.02-.193.028-.29l.995-.616a.34.34 0 0 0 0-.582zm-6.659 8.253a.705.705 0 0 1 .295-1.379.705.705 0 1 1-.296 1.379zm-.338-2.286a.641.641 0 0 0-.762.494l-.353 1.648c-1.09.495-2.3.77-3.575.77a8.63 8.63 0 0 1-3.65-.804l-.353-1.648a.64.64 0 0 0-.762-.493l-1.455.312a8.615 8.615 0 0 1-.752-.887h7.08c.08 0 .134-.014.134-.087v-2.505c0-.073-.053-.087-.134-.087h-2.071v-1.588h2.24c.204 0 1.093.058 1.377 1.194.089.349.284 1.486.418 1.85.133.408.675 1.223 1.253 1.223h3.528a.74.74 0 0 0 .128-.013 8.68 8.68 0 0 1-.802.941l-1.489-.32zm-9.793 2.252a.705.705 0 1 1-.296-1.379.705.705 0 0 1 .296 1.379zM4.211 9.036a.705.705 0 1 1-1.288.572.705.705 0 0 1 1.288-.572zm-.825 1.957l1.516-.674a.642.642 0 0 0 .326-.848l-.312-.706h1.228v5.534H3.667a8.668 8.668 0 0 1-.28-3.307zm6.652-.537V8.825h2.924c.151 0 1.066.175 1.066.859 0 .568-.702.772-1.279.772h-2.711zm10.626 1.468c0 .216-.008.431-.024.643h-.889c-.089 0-.125.058-.125.146v.408c0 .961-.542 1.17-1.017 1.223-.452.051-.953-.189-1.015-.466-.267-1.5-.711-1.821-1.413-2.374.871-.553 1.777-1.369 1.777-2.461 0-1.179-.809-1.922-1.36-2.287-.773-.51-1.629-.612-1.86-.612H5.545a8.658 8.658 0 0 1 4.847-2.736l1.084 1.137a.64.64 0 0 0 .907.021l1.212-1.16a8.668 8.668 0 0 1 5.931 4.224l-.83 1.875a.644.644 0 0 0 .326.848l1.598.71c.028.284.042.57.042.861zm-9.187-9.482a.703.703 0 1 1 .972 1.019.705.705 0 0 1-.972-1.019zm8.237 6.628c.157-.356.573-.516.928-.358a.705.705 0 1 1-.929.359z"/>
                            </svg>
                        </div>
                        <h2 class="h3">{"Build with Rust"}</h2>
                        <p class="text-muted">{"Strong commitment for fast, safe and reliable code. In the backend and the frontend."}</p>
                    </div>
                    <div class="col-sm">
                        <div class="shape shape-primary shape-md mb-3">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-hexagons" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M4 18v-5l4 -2l4 2v5l-4 2z"></path>
                                <path d="M8 11v-5l4 -2l4 2v5"></path>
                                <path d="M12 13l4 -2l4 2v5l-4 2l-4 -2"></path>
                             </svg>
                        </div>
                        <h2 class="h3">{"Modular design"}</h2>
                        <p class="text-muted">{"A modern microservice architecture allows us to deploy only the components you need, no unnecessary overhead"}</p>
                    </div>
                </div>
            </div>
          </div>
    );

    let section2 = view!(cx,

        <div class="items-center down card mx-auto">
            <div class="mt-5 d-flex">
                <div class="card-body">
                    <h2 class="section-title text-left">
                        {"Features"}
                    </h2>
                <div class="row">
                    <div class="col-6">
                        <div class="text-green mr-3">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-check icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M5 12l5 5l10 -10"></path>
                            </svg>
                        </div>
                        {"Store data"}
                    </div>
                    <div class="col-6">
                      <img src="/concept_aruna.png" class="img-fluid" alt="ConceptAruna" />
                    </div>
                  </div>
                </div>
             </div>
          </div>
    );

    let _timeline = view!(cx,

        <ul class="timeline">
            <li class="timeline-event">
              <div class="timeline-event-icon bg-twitter-lt">
              </div>
              <div class="card timeline-event-card">
                <div class="card-body">
                  <div class="text-muted float-end">{"10 hrs ago"}</div>
                  <h4>{"+1150 Followers"}</h4>
                  <p class="text-muted">{"Youre getting more and more followers, keep it up!"}</p>
                </div>
              </div>
            </li>
            <li class="timeline-event">
              <div class="timeline-event-icon">
              </div>
              <div class="card timeline-event-card">
                <div class="card-body">
                  <div class="text-muted float-end">{"2 hrs ago"}</div>
                  <h4>{"+3 New Products were added!"}</h4>
                  <p class="text-muted">{"Congratulations!"}</p>
                </div>
              </div>
            </li>
            <li class="timeline-event">
              <div class="timeline-event-icon">
              </div>
              <div class="card timeline-event-card">
                <div class="card-body">
                  <div class="text-muted float-end">{"1 day ago"}</div>
                  <h4>{"Database backup completed!"}</h4>
                  <p class="text-muted">{"Download the latest backup."}</p>
                </div>
              </div>
            </li>
            <li class="timeline-event">
              <div class="timeline-event-icon bg-facebook-lt">
              </div>
              <div class="card timeline-event-card">
                <div class="card-body">
                  <div class="text-muted float-end">{"1 day ago"}</div>
                  <h4>{"+290 Page Likes"}</h4>
                  <p class="text-muted">{"This is great, keep it up!"}</p>
                </div>
              </div>
            </li>
            <li class="timeline-event">
              <div class="timeline-event-icon">
              </div>
              <div class="card timeline-event-card">
                <div class="card-body">
                  <div class="text-muted float-end">{"2 days ago"}</div>
                  <h4>{"+3 Friend Requests"}</h4>
                </div>
              </div>
            </li>
            <li class="timeline-event">
              <div class="timeline-event-icon">
              </div>
              <div class="card timeline-event-card">
                <div class="card-body">
                  <div class="text-muted float-end">{"3 days ago"}</div>
                  <h4>{"+2 New photos"}</h4>
                  <div class="mt-3">
                    <div class="row g-2">
                      <div class="col-6">
                        <div class="media media-2x1 rounded">
                        </div>
                      </div>
                      <div class="col-6">
                        <div class="media media-2x1 rounded">
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </li>
            <li class="timeline-event">
              <div class="timeline-event-icon">
              </div>
              <div class="card timeline-event-card">
                <div class="card-body">
                  <div class="text-muted float-end">{"2 weeks ago"}</div>
                  <h4>{"System updated to v2.02"}</h4>
                  <p class="text-muted">{"Check the complete changelog at the"}</p>
                </div>
              </div>
            </li>
          </ul>
    );

    let faq = view!(cx,
        <div class="page-body">
            <div class="container-xl text-start">
              <div class="card card-lg">
                <div class="card-body">
                  <div class="space-y-4">
                    <div>
                      <h2 class="mb-3">{"1. Introduction"}</h2>
                      <div id="faq-1" class="accordion" role="tablist" aria-multiselectable="true">
                        <div class="accordion-item">
                          <div class="accordion-header" role="tab">
                            <button class="accordion-button" data-bs-toggle="collapse" data-bs-target="#faq-1-1">{"What is Aruna ?"}</button>
                          </div>
                          <div id="faq-1-1" class="accordion-collapse collapse show" role="tabpanel" data-bs-parent="#faq-1">
                            <div class="accordion-body pt-0">
                              <div>
                                <p>{"Aruna Object Storage (AOS) is an open source data storage platform that enables scientists to store, annotate and share their data according to "}<a href="https://www.go-fair.org/fair-principles/">{"FAIR"}</a>{" principles."}</p>
                                <p>{"The name Aruna originates from the god of the sea in hittite mythology and their name for the sea and bodies of water in general. 
                                     We choose this name to symbolize our vision of a revolutionary cloud-native data lake."}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="accordion-item">
                          <div class="accordion-header" role="tab">
                            <button class="accordion-button collapsed" data-bs-toggle="collapse" data-bs-target="#faq-1-2">{"Who are we?"}</button>
                          </div>
                          <div id="faq-1-2" class="accordion-collapse collapse" role="tabpanel" data-bs-parent="#faq-1">
                            <div class="accordion-body pt-0">
                              <div>
                                <p>{"Aruna is developed by a small team at Justus-Liebig-University Giessen for the NFDI project, as well as the GAIA-X connector project FAIR-Dataspaces"}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="accordion-item">
                          <div class="accordion-header" role="tab">
                            <button class="accordion-button collapsed" data-bs-toggle="collapse" data-bs-target="#faq-1-3">{"Why should I use Aruna for my project?"}</button>
                          </div>
                          <div id="faq-1-3" class="accordion-collapse collapse" role="tabpanel" data-bs-parent="#faq-1">
                            <div class="accordion-body pt-0">
                              <div>
                                <p>{"Storing data in localized specific data silos can limit collaboration, reuse, and analysis of data. The Aruna platform can bring great benefits for your research data such as improved collaboration, compliance with FAIR principles, scalability, data security, and easy integration with existing systems and workflows, ultimately accelerating scientific progress and improving research quality."}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h2 class="mb-3">{"2. Technical information"}</h2>
                      <div id="faq-2" class="accordion" role="tablist" aria-multiselectable="true">
                        <div class="accordion-item">
                          <div class="accordion-header" role="tab">
                            <button class="accordion-button collapsed" data-bs-toggle="collapse" data-bs-target="#faq-2-2">{"How can I log in?"}</button>
                          </div>
                          <div id="faq-2-2" class="accordion-collapse collapse" role="tabpanel" data-bs-parent="#faq-2">
                            <div class="accordion-body pt-0">
                              <div>
                                <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                                <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="accordion-item">
                          <div class="accordion-header" role="tab">
                            <button class="accordion-button collapsed" data-bs-toggle="collapse" data-bs-target="#faq-2-3">{"How many projects can I create?"}</button>
                          </div>
                          <div id="faq-2-3" class="accordion-collapse collapse" role="tabpanel" data-bs-parent="#faq-2">
                            <div class="accordion-body pt-0">
                              <div>
                                <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                                <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="accordion-item">
                          <div class="accordion-header" role="tab">
                            <button class="accordion-button collapsed" data-bs-toggle="collapse" data-bs-target="#faq-2-4">{"Is there a maximum storage capacity?"}</button>
                          </div>
                          <div id="faq-2-4" class="accordion-collapse collapse" role="tabpanel" data-bs-parent="#faq-2">
                            <div class="accordion-body pt-0">
                              <div>
                                <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                                <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="accordion-item">
                          <div class="accordion-header" role="tab">
                            <button class="accordion-button" data-bs-toggle="collapse" data-bs-target="#faq-2-5">{"Who can see my data?"}</button>
                          </div>
                          <div id="faq-2-5" class="accordion-collapse collapse show" role="tabpanel" data-bs-parent="#faq-2">
                            <div class="accordion-body pt-0">
                              <div>
                                <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                                <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="accordion-item">
                        <div class="accordion-header" role="tab">
                          <button class="accordion-button" data-bs-toggle="collapse" data-bs-target="#faq-4-1">{"Is my data secure?"}</button>
                        </div>
                        <div id="faq-4-1" class="accordion-collapse collapse show" role="tabpanel" data-bs-parent="#faq-4">
                          <div class="accordion-body pt-0">
                            <div>
                              <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                              <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      </div>
                    </div>
                    <div>
                      <h2 class="mb-3">{"3. Goals"}</h2>
                      <div id="faq-3" class="accordion" role="tablist" aria-multiselectable="true">
                        <div class="accordion-item">
                          <div class="accordion-header" role="tab">
                            <button class="accordion-button collapsed" data-bs-toggle="collapse" data-bs-target="#faq-3-2">{"What are the available payment options?"}</button>
                          </div>
                          <div id="faq-3-2" class="accordion-collapse collapse" role="tabpanel" data-bs-parent="#faq-3">
                            <div class="accordion-body pt-0">
                              <div>
                                <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                                <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="accordion-item">
                          <div class="accordion-header" role="tab">
                            <button class="accordion-button collapsed" data-bs-toggle="collapse" data-bs-target="#faq-3-3">{"Can I get a refund?"}</button>
                          </div>
                          <div id="faq-3-3" class="accordion-collapse collapse" role="tabpanel" data-bs-parent="#faq-3">
                            <div class="accordion-body pt-0">
                              <div>
                                <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                                <p>{"Lorem ipsum dolor sit amet, consectetur adipisicing elit. Accusantium alias dignissimos dolorum ea est eveniet, excepturi illum in iste iure maiores nemo recusandae rerum saepe sed, sunt totam! Explicabo, ipsa?"}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
    );

    let partners = view!(cx,
        <div class="row d-flex items-center text-center align-items-center">
            <a class="col" href="https://www.nfdi4biodiversity.org/en/">
                <div class="shape shape-primary shape-md mb-3">
                    <img src="/biodiv.png" class="img-fluid rounded-3 mb-4" alt="Biodiv" width="150" height="100" />
                </div>
            </a>
            <a class="col" href="https://www.uni-giessen.de/de/fbz/fb08/Inst/bioinformatik/software/aruna">
                <div class="shape shape-primary shape-md mb-3">
                    <img src="/jlu.png" class="img-fluid rounded-3 mb-4" alt="JLU" width="150" height="100" />
                </div>
            </a>
            <a class="col" href="https://elixir-europe.org/about-us/who-we-are/nodes/germany">
                <div class="shape shape-primary shape-md mb-3">
                    <img src="/elixir.png" class="img-fluid rounded-3 mb-4" alt="Elixir" width="150" height="100" />
                </div>
            </a>
            <a class="col" href="https://nfdi4microbiota.de/">
                <div class="shape shape-primary shape-md mb-3">
                    <img src="/microbiota.png" class="img-fluid rounded-3 mb-4" alt="Microbiota" width="150" height="100" />
                </div>
            </a>
            <a class="col" href="https://www.denbi.de/">
                <div class="shape shape-primary shape-md mb-3">
                    <img src="/denbi.svg" class="img-fluid rounded-3 mb-4" alt="deNBI" width="150" height="100" />
                </div>
            </a>
        </div>
    );

    view!(cx,
            {hook}
            <section class="section container-xl mt-5">
            {section1}
            </section>
            <section class="section container-xl mt-5">
            {section2}
            </section>
            //<section class="section container-xl mt-5">
            //{timeline}
            //</section>
            <section id="faq" class="section container-xl mt-5">
            {faq}
            </section>
            <section class="section container-xl mt-5">
            {partners}
            </section>
    )
}
