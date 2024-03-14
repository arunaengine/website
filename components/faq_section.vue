<template>
  <div class="row">
    <div class="card card-lg text-start col-lg-12">
      <div class="card-header">
        <span class="text-white avatar bg-primary me-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="icon icon-tabler icon-tabler-help-hexagon"
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
            <path
              d="M19.875 6.27c.7 .398 1.13 1.143 1.125 1.948v7.284c0 .809 -.443 1.555 -1.158 1.948l-6.75 4.27a2.269 2.269 0 0 1 -2.184 0l-6.75 -4.27a2.225 2.225 0 0 1 -1.158 -1.948v-7.285c0 -.809 .443 -1.554 1.158 -1.947l6.75 -3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98h-.033z"
            ></path>
            <path d="M12 16v.01"></path>
            <path
              d="M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483"
            ></path>
          </svg>
        </span>
        <h3 class="h2 card-text text-primary text-left ms-2">
          <b>FAQ</b>
        </h3>
      </div>
      <div class="card-body p-4">
        <div>
          <h2 class="mb-3">1. Introduction</h2>
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
                  What is Aruna ?
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
                      Aruna Object Storage (AOS) is an open source data storage
                      platform that enables scientists to store, annotate and
                      share their data according to
                      <a href="https://www.go-fair.org/fair-principles/">
                        FAIR
                      </a>
                      principles.
                    </p>
                    <p>
                      The name Aruna originates from the god of the sea in
                      hittite mythology and their name for the sea and bodies of
                      water in general. We choose this name to symbolize our
                      vision of a revolutionary cloud-native data lake.
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
                  Who are we?
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
                      Aruna is developed by a small team at
                      <a href="https://www.uni-giessen.de/de">
                        Justus-Liebig-University Giessen
                      </a>
                      for the NFDI4Biodiversity and NFDI4Microbiota projects, as
                      well as the GAIA-X connector project FAIR-Dataspaces
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
                  Why should I use Aruna for my project?
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
                      Storing data in localized domain specific data silos can
                      limit collaboration, reuse, and analysis of data. The
                      Aruna platform can bring great benefits for your research
                      data such as improved collaboration, compliance with FAIR
                      principles, scalability, data security, and easy
                      integration with existing systems and workflow systems,
                      ultimately accelerating scientific progress and improving
                      research quality.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-2">
          <h2 class="mb-3">2. Technical information</h2>
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
                  How can I log in?
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
                      Currently our service is an invitation only platform for
                      members of the NFDI consortia. In the future we plan to
                      open our platform for a broader audience.
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
                  How many projects can I create?
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
                      Projects are used to organize users on a per institution
                      or research project basis. They are created on demand,
                      contact us and we will figure out how to organize your
                      specific request.
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
                  Is there a maximum storage capacity?
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
                      Currently we do not enforce storage quotas, but as always
                      there is a physical limit in storage capacity. If you plan
                      to store large amounts of data (>1 TB) contact us and we
                      will figure out a solution.
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
                  Who can see my data?
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
                      You can choose how your data is shared, and we offer a
                      variety of access models, from highly confidential data to
                      public datasets that anyone can view and download. By
                      default, all of your data is private and only accessible
                      to the people you grant access to, but a minimal
                      configurable set of metadata is always public to ensure
                      discoverability.
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
                  Is my data secure?
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
                      When you use our managed service, we ensure that your data
                      is stored through our custom data proxy component, which
                      encrypts, compresses, and anonymizes all user-provided
                      data by default. This way, your data is always secure
                      while stored on disk.
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
                  What is a Dataproxy ?
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
                      Data proxies are the decentralized backbone of the data
                      plane, interacting directly with data storage providers
                      and providing a unified S3-compliant interface for data.
                      In addition, they can be configured to perform data
                      encryption, compression, anonymization, and end-user
                      access control, including enforcement of data usage
                      policies.
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
</template>
