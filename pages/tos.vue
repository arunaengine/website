<template>
  <NavigationTop />

  <div class="container mx-auto mt-4 p-4 border border-gray-400 rounded-md">
    <div class="border-b border-gray-400 px-4 dark:border-gray-700">
      <nav class="flex space-x-2" aria-label="Tabs" role="tablist">
        <button type="button"
          class="hs-tab-active:font-semibold hs-tab-active:border-aruna-800 hs-tab-active:text-aruna-800 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-sm whitespace-nowrap text-gray-500 hover:text-aruna-800 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-500 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600 active"
          id="basic-tabs-item-1" data-hs-tab="#basic-tabs-1" aria-controls="basic-tabs-1" role="tab">
          Nutzungsbedingungen
        </button>
        <button type="button"
          class="hs-tab-active:font-semibold hs-tab-active:border-aruna-800 hs-tab-active:text-aruna-800 py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-sm whitespace-nowrap text-gray-500 hover:text-aruna-800 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-500 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
          id="basic-tabs-item-2" data-hs-tab="#basic-tabs-2" aria-controls="basic-tabs-2" role="tab">
          Terms of Service
        </button>
      </nav>
    </div>

    <div class="mt-3 p-4">
      <div id="basic-tabs-1" role="tabpanel" aria-labelledby="basic-tabs-item-1">
        <h1 class="text-3xl font-bold text-gray-800 dark:text-white">
          Nutzungsbedingungen
        </h1>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          Die Nutzungsbedingungen regeln die Nutzung der Aruna Object Storage Plattform, im folgenden als Aruna
          bezeichnet, zur Speicherung von Forschungsdaten und dazugehörigen Metadaten. Der Betreiber, im folgenden als
          Betreiber bezeichnet, ist die Professur für Bioinformatik und Systembiologie der Justus-Liebig-Universität
          Gießen. Die Nutzungsbedingungen sind für alle Nutzenden bindend, unabhängig davon, wie der Zugang erfolgt.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Zustimmung zur Nutzung
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          Durch die Nutzung des Aruna Services erklären Sie sich damit einverstanden, diese Nutzungsbedingungen
          einzuhalten und akzeptieren sie als rechtliche Vereinbarung zwischen Ihnen und dem Betreiber des Aruna
          Services.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Nutzungsberechtigung
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          Sie erklären und garantieren, dass Sie berechtigt sind, die Forschungsdaten und Metadaten, die Sie über diesen
          Webservice hochladen, zu speichern und zu nutzen. Sie tragen die alleinige Verantwortung für die von Ihnen
          hochgeladenen Daten.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Verfügbarkeit
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          Zur Aufgabe der Betreiber gehört unter anderem die Planung, die Bereitstellung, der Betrieb, die Wartung und
          die Pflege des Aruna Services. Diese Leistungen werden im Rahmen der Ausstattung insbesondere bezüglich
          Personal sowie Compute- und Storage Ressourcen erbracht. Es können keine Garantien bzgl. der Verfügbarkeit und
          Fehlerfreiheit gegeben werden. Inbesondere wird kein Service Level vereinbart.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Datenschutz und Vertraulichkeit
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          Wir verpflichten uns, die von Ihnen hochgeladenen Forschungsdaten und Metadaten vertraulich zu behandeln. Wir
          geben Ihre Daten nicht ohne Ihre ausdrückliche Zustimmung an Dritte weiter, es sei denn, dies ist gesetzlich
          vorgeschrieben oder erforderlich, um den Webservice bereitzustellen.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Sicherheit
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          Wir setzen angemessene technische und organisatorische Maßnahmen ein, um die Sicherheit Ihrer Forschungsdaten
          und Metadaten zu gewährleisten und unbefugten Zugriff, unbefugte Offenlegung oder Datenverlust zu verhindern.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Geistiges Eigentum
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          Sie behalten das geistige Eigentum an den von Ihnen hochgeladenen Forschungsdaten und Metadaten. Sie gewähren
          uns jedoch eine nicht-exklusive, weltweite Lizenz zur Nutzung, Vervielfältigung und Anzeige Ihrer Daten und
          Metadaten im Rahmen des Betriebs und der Bereitstellung des Aruna Services
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Haftungsausschluss
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          Wir übernehmen keine Haftung für Verluste oder Schäden, die Ihnen durch die Nutzung des Aruna Services
          entstehen könnten, es sei denn, diese resultieren aus grober Fahrlässigkeit oder Vorsatz seitens des
          Betreibers des Aruna Services.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Datenlöschung
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          Sie haben das Recht, uns aufzufordern, Ihre Forschungsdaten und Metadaten zu löschen. Wir werden Ihre Daten
          innerhalb einer angemessenen Frist nach Erhalt einer solchen Anfrage löschen, sofern keine rechtlichen oder
          berechtigten Gründe für die Aufbewahrung der Daten vorliegen.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Änderungen der Nutzungsbedingungen
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          Wir behalten uns das Recht vor, diese Nutzungsbedingungen jederzeit zu ändern. Wir werden Sie über Änderungen
          informieren, indem wir die überarbeiteten Bedingungen auf unserer Website veröffentlichen. Die fortgesetzte
          Nutzung des Webservices nach solchen Änderungen gilt als Zustimmung zu den aktualisierten Nutzungsbedingungen.
        </p>
      </div>

      <div id="basic-tabs-2" class="hidden" role="tabpanel" aria-labelledby="basic-tabs-item-2">
        <h1 class="text-3xl font-bold text-gray-800 dark:text-white">
          Terms of service
        </h1>
        <p class="mt-1 text-xl font-medium uppercase text-gray-500 dark:text-gray-500">
          (translation, not legally binding)
        </p>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          The Terms of Service govern the use of the Aruna Object Storage Platform, hereafter referred to as
          Aruna, for the storage of research data and associated metadata. The operator, subsequently referred
          to as the Operator, is the Chair of Bioinformatics and Systems Biology at Justus Liebig University
          Giessen. The terms of use are binding for all users, regardless of how access is provided.
        </p>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          We, the University of Giessen represented by its President, take the protection of your personal
          data very seriously and strictly adhere to the rules of data protection laws. The following
          statement gives you an overview of what kind of personal data is collected, for what purpose and how
          long it is stored.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Consent of use
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          By using the Aruna Service, you agree to comply with these Terms of Service and accept them as a
          legal agreement between you and the operator of the Aruna Service.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Authorization
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          By using the Aruna Service, you agree to comply with these Terms of Service and accept them as a
          legal agreement between you and the operator of the Aruna Service.
        </p>
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          You agree and warrant that you are authorized to store and use the research data and metadata that
          you upload through this web service. You are solely responsible for the data you upload.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Availability
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          The Operators' responsibilities include, but are not limited to, planning, providing, operating,
          maintaining and servicing the Aruna Service. These services are provided within the scope of the
          equipment, in particular with regard to personnel as well as compute and storage resources. No
          guarantees can be given with regard to availability and freedom from errors. In particular, no
          service level is agreed upon.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Data protection and confidentiality
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          We are committed to keeping the research data and metadata uploaded by you confidential. We will not
          share
          your data with third parties without your explicit consent, unless required by law or in order to be
          able to
          provide the web service.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Security
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          We have implemented appropriate technical and organizational measures to ensure the security of your
          research data and metadata preventing unauthorized access, disclosure, or loss of data.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Intellectual Property
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          You retain intellectual property rights in the research data and metadata you upload. However, you
          grant us
          a non-exclusive, worldwide license to use, reproduce and display your data and metadata in the
          course of
          operating and providing the Aruna Service.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Data Deletion
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
          You have the right to request us to delete your Research Data and Metadata. We will delete your data
          within
          a reasonable period of time after receiving such request, unless there are legal or legitimate
          reasons for
          keeping the data.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-gray-600 dark:text-gray-500">
          Changes to Terms of Service
        </h3>
        <hr class="border-gray-400">
        <p class="mt-2 p-4 text-gray-800 dark:text-gray-400">
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