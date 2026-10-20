<template>
  <NavigationTop />

  <div class="container max-w-3xl py-12">
    <div class="border-b border-border">
      <nav class="flex space-x-2" aria-label="Tabs" role="tablist">
        <button type="button"
                class="hs-tab-active:font-semibold hs-tab-active:border-aruna-aqua hs-tab-active:text-foreground py-4 px-1 inline-flex items-center gap-x-2 border-b border-transparent text-sm whitespace-nowrap text-aruna-text disabled:opacity-50 disabled:pointer-events-none :focus:outline-none focus:ring-1 focus:rounded-sm focus:ring-aruna-highlight active"
                id="basic-tabs-item-1"
                data-hs-tab="#basic-tabs-1"
                aria-controls="basic-tabs-1"
                role="tab">
          Nutzungsbedingungen
        </button>
        <button type="button"
                class="hs-tab-active:font-semibold hs-tab-active:border-aruna-aqua hs-tab-active:text-foreground py-4 px-1 inline-flex items-center gap-x-2 border-b border-transparent text-sm whitespace-nowrap text-aruna-text disabled:opacity-50 disabled:pointer-events-none :focus:outline-none focus:ring-1 focus:rounded-sm focus:ring-aruna-highlight"
                id="basic-tabs-item-2"
                data-hs-tab="#basic-tabs-2"
                aria-controls="basic-tabs-2"
                role="tab">
          Terms of Service
        </button>
      </nav>
    </div>

    <div class="mt-6">
      <div id="basic-tabs-1" role="tabpanel" aria-labelledby="basic-tabs-item-1">
        <h1 class="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Nutzungsbedingungen
        </h1>
        <p class="mt-2 text-aruna-text">
          Die Nutzungsbedingungen regeln die Nutzung der Aruna Object Storage Plattform, im folgenden als Aruna
          bezeichnet, zur Speicherung von Forschungsdaten und dazugehörigen Metadaten. Der Betreiber, im folgenden als
          Betreiber bezeichnet, ist die Professur für Bioinformatik und Systembiologie der Justus-Liebig-Universität
          Gießen. Die Nutzungsbedingungen sind für alle Nutzenden bindend, unabhängig davon, wie der Zugang erfolgt.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Zustimmung zur Nutzung
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          Durch die Nutzung des Aruna Services erklären Sie sich damit einverstanden, diese Nutzungsbedingungen
          einzuhalten und akzeptieren sie als rechtliche Vereinbarung zwischen Ihnen und dem Betreiber des Aruna
          Services.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Nutzungsberechtigung
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          Sie erklären und garantieren, dass Sie berechtigt sind, die Forschungsdaten und Metadaten, die Sie über diesen
          Webservice hochladen, zu speichern und zu nutzen. Sie tragen die alleinige Verantwortung für die von Ihnen
          hochgeladenen Daten.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Verfügbarkeit
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          Zur Aufgabe der Betreiber gehört unter anderem die Planung, die Bereitstellung, der Betrieb, die Wartung und
          die Pflege des Aruna Services. Diese Leistungen werden im Rahmen der Ausstattung insbesondere bezüglich
          Personal sowie Compute- und Storage Ressourcen erbracht. Es können keine Garantien bzgl. der Verfügbarkeit und
          Fehlerfreiheit gegeben werden. Inbesondere wird kein Service Level vereinbart.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Datenschutz und Vertraulichkeit
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          Wir verpflichten uns, die von Ihnen hochgeladenen Forschungsdaten und Metadaten vertraulich zu behandeln. Wir
          geben Ihre Daten nicht ohne Ihre ausdrückliche Zustimmung an Dritte weiter, es sei denn, dies ist gesetzlich
          vorgeschrieben oder erforderlich, um den Webservice bereitzustellen.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Sicherheit
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          Wir setzen angemessene technische und organisatorische Maßnahmen ein, um die Sicherheit Ihrer Forschungsdaten
          und Metadaten zu gewährleisten und unbefugten Zugriff, unbefugte Offenlegung oder Datenverlust zu verhindern.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Geistiges Eigentum
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          Sie behalten das geistige Eigentum an den von Ihnen hochgeladenen Forschungsdaten und Metadaten. Sie gewähren
          uns jedoch eine nicht-exklusive, weltweite Lizenz zur Nutzung, Vervielfältigung und Anzeige Ihrer Daten und
          Metadaten im Rahmen des Betriebs und der Bereitstellung des Aruna Services
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Haftungsausschluss
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          Wir übernehmen keine Haftung für Verluste oder Schäden, die Ihnen durch die Nutzung des Aruna Services
          entstehen könnten, es sei denn, diese resultieren aus grober Fahrlässigkeit oder Vorsatz seitens des
          Betreibers des Aruna Services.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Datenlöschung
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          Sie haben das Recht, uns aufzufordern, Ihre Forschungsdaten und Metadaten zu löschen. Wir werden Ihre Daten
          innerhalb einer angemessenen Frist nach Erhalt einer solchen Anfrage löschen, sofern keine rechtlichen oder
          berechtigten Gründe für die Aufbewahrung der Daten vorliegen.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Änderungen der Nutzungsbedingungen
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          Wir behalten uns das Recht vor, diese Nutzungsbedingungen jederzeit zu ändern. Wir werden Sie über Änderungen
          informieren, indem wir die überarbeiteten Bedingungen auf unserer Website veröffentlichen. Die fortgesetzte
          Nutzung des Webservices nach solchen Änderungen gilt als Zustimmung zu den aktualisierten Nutzungsbedingungen.
        </p>
      </div>

      <div id="basic-tabs-2" class="hidden" role="tabpanel" aria-labelledby="basic-tabs-item-2">
        <h1 class="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Terms of service
        </h1>
        <p class="mt-1 text-xl font-medium uppercase text-muted-foreground">
          (translation, not legally binding)
        </p>
        <p class="mt-2 text-aruna-text">
          The Terms of Service govern the use of the Aruna Object Storage Platform, hereafter referred to as
          Aruna, for the storage of research data and associated metadata. The operator, subsequently referred
          to as the Operator, is the Chair of Bioinformatics and Systems Biology at Justus Liebig University
          Giessen. The terms of use are binding for all users, regardless of how access is provided.
        </p>
        <p class="mt-2 text-aruna-text">
          We, the University of Giessen represented by its President, take the protection of your personal
          data very seriously and strictly adhere to the rules of data protection laws. The following
          statement gives you an overview of what kind of personal data is collected, for what purpose and how
          long it is stored.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Consent of use
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          By using the Aruna Service, you agree to comply with these Terms of Service and accept them as a
          legal agreement between you and the operator of the Aruna Service.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Authorization
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          By using the Aruna Service, you agree to comply with these Terms of Service and accept them as a
          legal agreement between you and the operator of the Aruna Service.
        </p>
        <p class="p-4 pt-0 text-aruna-text">
          You agree and warrant that you are authorized to store and use the research data and metadata that
          you upload through this web service. You are solely responsible for the data you upload.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Availability
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          The Operators' responsibilities include, but are not limited to, planning, providing, operating,
          maintaining and servicing the Aruna Service. These services are provided within the scope of the
          equipment, in particular with regard to personnel as well as compute and storage resources. No
          guarantees can be given with regard to availability and freedom from errors. In particular, no
          service level is agreed upon.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Data protection and confidentiality
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          We are committed to keeping the research data and metadata uploaded by you confidential. We will not
          share
          your data with third parties without your explicit consent, unless required by law or in order to be
          able to
          provide the web service.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Security
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          We have implemented appropriate technical and organizational measures to ensure the security of your
          research data and metadata preventing unauthorized access, disclosure, or loss of data.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Intellectual Property
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          You retain intellectual property rights in the research data and metadata you upload. However, you
          grant us
          a non-exclusive, worldwide license to use, reproduce and display your data and metadata in the
          course of
          operating and providing the Aruna Service.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Data Deletion
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          You have the right to request us to delete your Research Data and Metadata. We will delete your data
          within
          a reasonable period of time after receiving such request, unless there are legal or legitimate
          reasons for
          keeping the data.
        </p>

        <h3 class="mt-6 mb-2 font-display text-lg font-semibold text-foreground">
          Changes to Terms of Service
        </h3>
        <p class="mt-2 py-2 leading-relaxed text-muted-foreground">
          We reserve the right to change these Terms of Service at any time. We will notify you of changes by
          posting the revised terms on our website. Your continued use of the Web Service following such changes will
          constitute your acceptance of the updated Terms of Service.
        </p>
      </div>
    </div>
  </div>

  <Footer />
</template>
<script setup lang="ts">
</script>