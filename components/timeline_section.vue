<template>
    <div class="row">
        <div class="card text-start col-lg-12" id="timeline">
            <div class="card-header">
                <span class="text-white avatar bg-primary me-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-info-square" width="40"
                        height="40" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"
                        stroke-linecap="round" stroke-linejoin="round">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                        <path d="M12 9h.01"></path>
                        <path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14z"></path>
                        <path d="M11 12h1v4h1"></path>
                    </svg>
                </span>
                <h3 class="h2 card-text text-left ms-2 text-primary">
                    <b>News & Updates</b>
                </h3>
            </div>
            <div class="card-body">
                <ul class="timeline">
                    <li class="timeline-event">
                        <div class="text-white timeline-event-icon bg-primary">
                            <svg xmlns="http://www.w3.org/2000/svg"
                                class="icon icon-tabler icon-tabler-info-hexagon fw-bolder" width="40" height="40"
                                viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path
                                    d="M19.875 6.27c.7 .398 1.13 1.143 1.125 1.948v7.284c0 .809 -.443 1.555 -1.158 1.948l-6.75 4.27a2.269 2.269 0 0 1 -2.184 0l-6.75 -4.27a2.225 2.225 0 0 1 -1.158 -1.948v-7.285c0 -.809 .443 -1.554 1.158 -1.947l6.75 -3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98h-.033z">
                                </path>
                                <path d="M12 9h.01"></path>
                                <path d="M11 12h1v4h1"></path>
                            </svg>
                        </div>
                        <div class="card timeline-event-card">
                            <div class="card-body">
                                <h3 class="h2">🎉 Version 2.0.0 preview out now!</h3>
                                <p>
                                <div class="text-muted">
                                    <p>
                                    <div>
                                        We are very happy to anounce that the Open-Beta of Aruna Version 2.0 has started
                                    </div>
                                    <div>
                                        This integrates many long awaited features and improvements. Such as:
                                    </div>
                                    </p>
                                    <p>
                                    <div>
                                        <b>- Relaxed hierarchy:</b>
                                        You can now arrange your objects in a tree-like structure without the requirement
                                        for intermediate collections.
                                    </div>
                                    <div>
                                        <b>- Improved search:</b>
                                        A new typo-tolerant metadata search with advanced query capabilities
                                    </div>
                                    <div>
                                        <b>- Hooks:</b>
                                        Automated actions on object creation for data transformation and validation
                                    </div>
                                    <div>
                                        <b>- Improved web interface:</b>
                                        You can explore the preview
                                        <a href="/search">here</a>
                                        !
                                    </div>
                                    <div>
                                        <b>- Data proxy overhaul:</b>
                                        Data proxies have been completely redesigned to separate data storage from the
                                        metadata management system
                                    </div>
                                    <div>
                                        <b>- Fine grained user permissions:</b>
                                        A new attribute based user permission system has been added
                                    </div>
                                    <div>
                                        <b>- New tags:</b>
                                        A new attribute based user permission system has been added
                                    </div>
                                    <div>
                                        <b>- and a lot more...</b>
                                    </div>
                                    </p>
                                    <p>
                                    <div>
                                        <b>
                                            Login and try it out! If you find any issues or have any feedback, please let
                                            us know by opening an issue on Github or by sending us an email.
                                        </b>
                                    </div>
                                    </p>
                                </div>
                                </p>
                            </div>
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>