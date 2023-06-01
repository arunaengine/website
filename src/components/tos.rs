use leptos::*;
use leptos_meta::*;

#[component]
pub fn Tos(cx: Scope) -> impl IntoView {
    provide_meta_context(cx);

    view! {cx,

        <div class="card px-4 my-5 text-start col-10 mx-auto">
            <img class="d-block mx-auto" src="/aruna_icon.png" alt="" width="72" />
            <div class="card-body">
                <h1>"Terms of service (translation, not legally binding)"</h1>
                <div>"The Terms of Service govern the use of the Aruna Object Storage Platform, hereafter referred to as Aruna, for the storage of research data and associated metadata. The operator, subsequently referred to as the Operator, is the Chair of Bioinformatics and Systems Biology at Justus Liebig University Giessen.
                The terms of use are binding for all users, regardless of how access is provided."</div>
                <div>"We, the University of Giessen represented by its President, take the protection of your personal data very seriously and strictly adhere to the rules of data protection laws. The following statement gives you an overview of what kind of personal data is collected, for what purpose and how long it is stored."</div>

                <h3 class="mt-2">"Consent of use"</h3>
                <div>"By using the Aruna Service, you agree to comply with these Terms of Service and accept them as a legal agreement between you and the operator of the Aruna Service."</div>

                <h3 class="mt-2">"Authorization"</h3>
                <div>"You agree and warrant that you are authorized to store and use the research data and metadata that you upload through this web service. You are solely responsible for the data you upload."</div>

                <h3 class="mt-2">"Availability"</h3>
                <div>"The Operators' responsibilities include, but are not limited to, planning, providing, operating, maintaining and servicing the Aruna Service. These services are provided within the scope of the equipment, in particular with regard to personnel as well as compute and storage resources. No guarantees can be given with regard to availability and freedom from errors. In particular, no service level is agreed upon."</div>

                <h3 class="mt-2">"Data protection and confidentiality"</h3>
                <div>"We are committed to keeping the research data and metadata uploaded by you confidential. We will not share your data with third parties without your explicit consent, unless required by law or in order to be able to provide the web service."</div>

                <h3 class="mt-2">"Security"</h3>
                <div>"We have implemented appropriate technical and organizational measures to ensure the security of your research data and metadata preventing unauthorized access, disclosure, or loss of data."</div>

                <h3 class="mt-2">"Intellectual Property"</h3>
                <div>"You retain intellectual property rights in the research data and metadata you upload. However, you grant us a non-exclusive, worldwide license to use, reproduce and display your data and metadata in the course of operating and providing the Aruna Service."</div>

                <h3 class="mt-2">"Data Deletion"</h3>
                <div>"You have the right to request us to delete your Research Data and Metadata. We will delete your data within a reasonable period of time after receiving such request, unless there are legal or legitimate reasons for keeping the data."</div>

                <h3 class="mt-2">"Changes to Terms of Service"</h3>
                <div>"We reserve the right to change these Terms of Service at any time. We will notify you of changes by posting the revised terms on our website. Your continued use of the Web Service following such changes will constitute your acceptance of the updated Terms of Service."</div>

            </div>
        </div>

        <div class="card px-4 my-5 text-start col-10 mx-auto mt-3">
            <div class="card-body">
            <h1 class="mt-2">"Nutzungsbedingungen (deutsch)"</h1>

            <div>"Die Nutzungsbedingungen regeln die Nutzung der Aruna Object Storage Plattform, im folgenden als Aruna bezeichnet, zur Speicherung von Forschungsdaten und dazugehörigen Metadaten. Der Betreiber, im folgenden als Betreiber bezeichnet, ist die Professur für Bioinformatik und Systembiologie der Justus-Liebig-Universität Gießen.
            Die Nutzungsbedingungen sind für alle Nutzenden bindend, unabhängig davon, wie der Zugang erfolgt."</div>

            <h3 class="mt-2">"Zustimmung zur Nutzung"</h3>
            <div>"Durch die Nutzung des Aruna Services erklären Sie sich damit einverstanden, diese Nutzungsbedingungen einzuhalten und akzeptieren sie als rechtliche Vereinbarung zwischen Ihnen und dem Betreiber des Aruna Services."</div>


            <h3 class="mt-2">"Nutzungsberechtigung"</h3>
            <div>"Sie erklären und garantieren, dass Sie berechtigt sind, die Forschungsdaten und Metadaten, die Sie über diesen Webservice hochladen, zu speichern und zu nutzen. Sie tragen die alleinige Verantwortung für die von Ihnen hochgeladenen Daten."</div>


            <h3 class="mt-2">"Verfügbarkeit"</h3>
            <div>"Zur Aufgabe der Betreiber gehört unter anderem die Planung, die Bereitstellung, der Betrieb, die Wartung und die Pflege des Aruna Services. Diese Leistungen werden im Rahmen der Ausstattung insbesondere bezüglich Personal sowie Compute- und Storage Ressourcen erbracht. Es können keine Garantien bzgl. der Verfügbarkeit und Fehlerfreiheit gegeben werden. Inbesondere wird kein Service Level vereinbart."</div>

            <h3 class="mt-2">"Datenschutz und Vertraulichkeit"</h3>
            <div>"Wir verpflichten uns, die von Ihnen hochgeladenen Forschungsdaten und Metadaten vertraulich zu behandeln. Wir geben Ihre Daten nicht ohne Ihre ausdrückliche Zustimmung an Dritte weiter, es sei denn, dies ist gesetzlich vorgeschrieben oder erforderlich, um den Webservice bereitzustellen."</div>

            <h3 class="mt-2">"Sicherheit"</h3>
            <div>"Wir setzen angemessene technische und organisatorische Maßnahmen ein, um die Sicherheit Ihrer Forschungsdaten und Metadaten zu gewährleisten und unbefugten Zugriff, unbefugte Offenlegung oder Datenverlust zu verhindern."</div>

            <h3 class="mt-2">"Geistiges Eigentum"</h3>
            <div>"Sie behalten das geistige Eigentum an den von Ihnen hochgeladenen Forschungsdaten und Metadaten. Sie gewähren uns jedoch eine nicht-exklusive, weltweite Lizenz zur Nutzung, Vervielfältigung und Anzeige Ihrer Daten und Metadaten im Rahmen des Betriebs und der Bereitstellung des Aruna Services."</div>

            <h3 class="mt-2">"Haftungsausschluss"</h3>
            <div>"Wir übernehmen keine Haftung für Verluste oder Schäden, die Ihnen durch die Nutzung des Aruna Services entstehen könnten, es sei denn, diese resultieren aus grober Fahrlässigkeit oder Vorsatz seitens des Betreibers des Aruna Services."</div>

            <h3 class="mt-2">"Datenlöschung"</h3>
            <div>"Sie haben das Recht, uns aufzufordern, Ihre Forschungsdaten und Metadaten zu löschen. Wir werden Ihre Daten innerhalb einer angemessenen Frist nach Erhalt einer solchen Anfrage löschen, sofern keine rechtlichen oder berechtigten Gründe für die Aufbewahrung der Daten vorliegen."</div>

            <h3 class="mt-2">"Änderungen der Nutzungsbedingungen"</h3>
            <div>"Wir behalten uns das Recht vor, diese Nutzungsbedingungen jederzeit zu ändern. Wir werden Sie über Änderungen informieren, indem wir die überarbeiteten Bedingungen auf unserer Website veröffentlichen. Die fortgesetzte Nutzung des Webservices nach solchen Änderungen gilt als Zustimmung zu den aktualisierten Nutzungsbedingungen."</div>

        </div>
    </div>
        }
}
