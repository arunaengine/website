use leptos::*;
use leptos_meta::*;

#[component]
pub fn Imprint(cx: Scope) -> impl IntoView {

    provide_meta_context(cx);

    view!{cx,
    
    <div class="card px-4 my-5 text-center col-10 mx-auto">
        <img class="d-block mx-auto" src="/aruna_icon.png" alt="" width="72" />
        <div class="card-body">
        <h1>"Datenschutzerklärung"</h1>

        <div>"Wir, die Universität Gießen vertreten durch ihren Präsidenten, nehmen den Schutz Ihrer persönlichen Daten sehr ernst und halten uns strikt an die Regeln der Datenschutzgesetze. Die nachfolgende Erklärung gibt Ihnen einen Überblick darüber, welche Art von personenbezogenen Daten erhoben werden, zu welchem Zweck und wie lange diese gespeichert werden."</div>

        <h3>"1. Verantwortlicher"</h3>

        <div>"Verantwortlicher für die Datenverarbeitung ist:"</div>

        <div>
        "Präsident der
        Justus-Liebig-Universität Gießen
        Ludwigstraße 23
        35390 Gießen
        Deutschland"
        </div>
        <a href="mailto:support@aruna-storage.org">"support@aruna-storage.org"</a>


        <h3>"2. Erhebung von personenbezogenen Daten"</h3>

        <div>"Wir erheben personenbezogene Daten von Ihnen, wenn Sie sich für einen Account auf unserer Website registrieren. Folgende personenbezogene Daten werden erhoben:"</div>

        <div>"- Einen selbst zu vergebenen Namen"</div>
        <div>"- Vorzugsweise eine E-Mail-Adresse zur Kontaktaufnahme"</div>

        <h3>"3. Zweck der Datenverarbeitung"</h3>

        <div>"Die von Ihnen angegebenen personenbezogenen Daten werden ausschließlich zur Erstellung Ihres Accounts verwendet. Falls eine Emailadresse hinterlegt wurde, informieren wir Sie über Account relevante Ereignisse."</div>

        <h3>"4. Rechtsgrundlage für die Datenverarbeitung"</h3>

        <div>"Die Rechtsgrundlage für die Verarbeitung Ihrer personenbezogenen Daten zur Erstellung Ihres Accounts ist Art. 6 Abs. 1 lit. b DSGVO."</div>

        <h3>"5. Speicherdauer der Daten"</h3>

        <div>"Ihre personenbezogenen Daten werden für die Dauer Ihres Accounts bei uns gespeichert. Wenn Sie Ihren Account löschen, werden Ihre Daten umgehend gelöscht."</div>

        <h3>"6. Ihre Rechte als betroffene Person"</h3>

        <div>"Sie haben das Recht, Auskunft über die bei uns gespeicherten personenbezogenen Daten zu erhalten sowie das Recht auf Berichtigung, Löschung und Einschränkung der Verarbeitung Ihrer personenbezogenen Daten (Art.&nbsp;15, 16 und 18 der Europäischen Datenschutzgrundverordnung). Falls Sie die Datenverarbeitung für rechtswidrig halten, können Sie Beschwerde beim Hessischen Datenschutzbeauftragten erheben (Art.&nbsp;77 der Europäischen Datenschutzgrundverordnung, §55 des Hessischen Datenschutz- und Informationsfreiheitsgesetzes). Darüber hinaus sind Sie berechtigt, Ihre Einwilligung in die Datenverarbeitung zu widerrufen und die Löschung Ihrer Daten zu verlangen, wobei die bis dahin erfolgte Datenverarbeitung rechtmäßig bleibt (Art.&nbsp;7 Abs.&nbsp;3 und Art.&nbsp;17. EU-DSGVO). Ferner können Sie verlangen, Ihre Daten in portabler Form übermittelt zu bekommen oder an einen anderen Verantwortlichen übermitteln zu lassen (Art.&nbsp;20 EU-DSGVO)."</div>

        <h3>"7. Kontakt"</h3>

        <div>"Wenn Sie Fragen zur Erhebung, Verarbeitung oder Nutzung Ihrer personenbezogenen Daten haben, kontaktieren Sie uns bitte per E-Mail unter "<a href="mailto:datenschutz@aruna-storage.org">"datenschutz@aruna-storage.org"</a>"."

        <h3>"8. Datenschutzbeauftragte"</h3>

        <div>
        "Die Datenschutzbeauftragten der Universität sind:
        Axel P. Globuschütz
        Ludwigstraße 23, Raum 227
        35390 Gießen"
        </div>
        <a href="mailto:Datenschutz@uni-giessen.de">"Datenschutz@uni-giessen.de"</a>
        <div>"Tel. 0641-99 12230"</div>

        <div>"Carl Philip Bolldorf"</div>
        <a href="mailto:Datenschutz@uni-giessen.de">"Datenschutz@uni-giessen.de"</a>
        <div>"Tel. 0641-99 12270"</div>

        <div>"Stand: 20. April 2023"</div>

        <div>"Bitte beachten Sie, dass diese Datenschutzerklärung jederzeit geändert werden kann. Eine jeweils aktuelle Version finden Sie auf unserer Website."</div>
        </div>
    </div>
</div>
    }
}