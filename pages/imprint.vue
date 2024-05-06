<script setup lang="ts">
import { IconMail } from '@tabler/icons-vue';

</script>

<template>
  <NavigationTop />
  
  <div class="container mx-auto mt-4 p-4 border rounded-lg bg-white/[.25]">
    <h1 class="text-3xl font-bold text-gray-800 dark:text-white">
      Imprint
    </h1>
    <hr class="border-gray-200 my-5">

    <div class="border-b border-gray-200 px-4 dark:border-gray-700">
      <nav class="flex space-x-2" aria-label="Tabs" role="tablist">
        <button type="button"
          class="hs-tab-active:font-semibold hs-tab-active:border-arunaPrimary hs-tab-active:text-arunaPrimary py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-sm whitespace-nowrap text-gray-500 hover:text-arunaPrimary disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-500 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600 active"
          id="basic-tabs-item-1" data-hs-tab="#basic-tabs-1" aria-controls="basic-tabs-1" role="tab">
          Datenschutzerklärung
        </button>
        <button type="button"
          class="hs-tab-active:font-semibold hs-tab-active:border-arunaPrimary hs-tab-active:text-arunaPrimary py-4 px-1 inline-flex items-center gap-x-2 border-b-2 border-transparent text-sm whitespace-nowrap text-gray-500 hover:text-arunaPrimary disabled:opacity-50 disabled:pointer-events-none dark:text-gray-400 dark:hover:text-blue-500 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
          id="basic-tabs-item-2" data-hs-tab="#basic-tabs-2" aria-controls="basic-tabs-2" role="tab">
          Privacy Policy
        </button>
      </nav>
    </div>

    <div class="mt-3 p-4">
      <div id="basic-tabs-1" role="tabpanel" aria-labelledby="basic-tabs-item-1">
        <h2 class="text-2xl font-bold text-gray-700 dark:text-white">
          Datenschutzerklärung
        </h2>

        <p class="mt-2 text-gray-800 dark:text-gray-400">
          Wir, die Universität Gießen vertreten durch ihren Präsidenten, nehmen den Schutz Ihrer persönlichen Daten sehr
          ernst und halten uns strikt an die Regeln der Datenschutzgesetze. Die nachfolgende Erklärung gibt Ihnen einen
          Überblick darüber, welche Art von personenbezogenen Daten erhoben werden, zu welchem Zweck und wie lange diese
          gespeichert werden.
        </p>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          1. Verantwortlicher
        </h3>
        <div><strong>Verantwortlicher für die Datenverarbeitung ist:</strong></div>
        <div>Präsidentin die</div>
        <div>Justus-Liebig-Universität Gießen</div>
        <div>Ludwigstraße 23</div>
        <div>35390 Giessen</div>
        <div>Germany</div>
        <div>
          <NuxtLink
            class="inline-flex items-center gap-x-1 text-sm font-semibold rounded-lg border border-transparent text-arunaPrimary hover:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            to="mailto:support@aruna-storage.org" target="_blank">
            <IconMail class="flex-shrink-0 size-4" /> support@aruna-storage.org
          </NuxtLink>
        </div>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          2. Erhebung von personenbezogenen Daten
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          Wir erheben personenbezogene Daten von Ihnen, wenn Sie sich für einen Account auf unserer Website oder im
          Email-verteiler registrieren. <br />Folgende personenbezogene Daten werden erhoben:
        </p>
        <ul class="list-disc list-inside p-4">
          <li>Einen selbst zu vergebenen Namen</li>
          <li>Eine E-Mail-Adresse zur Kontaktaufnahme</li>
        </ul>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          3. Zweck der Datenverarbeitung
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          Die von Ihnen angegebenen personenbezogenen Daten werden ausschließlich zur Erstellung Ihres Accounts oder der
          Verarbeitung des Email verteilers verwendet. Falls eine Emailadresse hinterlegt wurde, informieren wir Sie
          über Account relevante Ereignisse und allgemeine Ereignisse des Systems (Updates, Status etc.).
        </p>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          4. Rechtsgrundlage für die Datenverarbeitung
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          Die Rechtsgrundlage für die Verarbeitung Ihrer personenbezogenen Daten zur Erstellung Ihres Accounts ist Art.
          6 Abs. 1 lit. b DSGVO.
        </p>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          5. Speicherdauer der Daten
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          Ihre personenbezogenen Daten werden für die Dauer Ihres Accounts bei uns gespeichert. Wenn Sie Ihren Account
          löschen, werden Ihre Daten umgehend gelöscht.
        </p>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          6. Ihre Rechte als betroffene Person
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          Sie haben das Recht, Auskunft über die bei uns gespeicherten personenbezogenen Daten zu erhalten sowie das
          Recht auf Berichtigung, Löschung und Einschränkung der Verarbeitung Ihrer personenbezogenen Daten (Art. 15, 16
          und 18 der Europäischen Datenschutzgrundverordnung). Falls Sie die Datenverarbeitung für rechtswidrig halten,
          können Sie Beschwerde beim Hessischen Datenschutzbeauftragten erheben (Art. 77 der Europäischen
          Datenschutzgrundverordnung, §55 des Hessischen Datenschutz- und Informationsfreiheitsgesetzes). Darüber hinaus
          sind Sie berechtigt, Ihre Einwilligung in die Datenverarbeitung zu widerrufen und die Löschung Ihrer Daten zu
          verlangen, wobei die bis dahin erfolgte Datenverarbeitung rechtmäßig bleibt (Art. 7 Abs. 3 und Art. 17.
          EU-DSGVO). Ferner können Sie verlangen, Ihre Daten in portabler Form übermittelt zu bekommen oder an einen
          anderen Verantwortlichen übermitteln zu lassen (Art. 20 EU-DSGVO).
        </p>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          7. Kontakt
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          Wenn Sie Fragen zur Erhebung, Verarbeitung oder Nutzung Ihrer personenbezogenen Daten haben, kontaktieren Sie
          uns bitte per E-Mail unter
          <NuxtLink
            class="inline-flex items-center gap-x-1 text-sm font-semibold rounded-lg border border-transparent text-arunaPrimary hover:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            to="mailto:datenschutz@aruna-storage.org" target="_blank">
            <IconMail class="flex-shrink-0 size-4" /> datenschutz@aruna-storage.org
          </NuxtLink>.
        </p>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          8. Datenschutzbeauftragte
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          <strong>
            Die Kontaktdaten des behördlichen Datenschutzbeauftragten der Justus-Liebig-Universität sind:
          </strong>
        </p>
        <div>Justus-Liebig-Universität Gießen</div>
        <div>Der behördliche Datenschutzbeauftragte</div>
        <div>Ludwigstraße 23</div>
        <div>35390 Gießen</div>
        <div>Tel: 0641-99 122 30 / 0641-99 122 70</div>
        <NuxtLink
          class="inline-flex items-center gap-x-1 text-sm font-semibold rounded-lg border border-transparent text-arunaPrimary hover:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
          to="mailto:datenschutz@aruna-storage.org" target="_blank">
          <IconMail class="flex-shrink-0 size-4" /> datenschutz@aruna-storage.org
        </NuxtLink>
        <div>Last updated: 20. April 2023</div>
        <hr class="border-gray-200 my-5">
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          Bitte beachten Sie, dass diese Datenschutzerklärung jederzeit geändert werden kann. Eine jeweils aktuelle
          Version finden Sie auf dieser Website.
        </p>
      </div>

      <div id="basic-tabs-2" class="hidden" role="tabpanel" aria-labelledby="basic-tabs-item-2">
        <h2 class="text-2xl font-bold text-gray-700 dark:text-white">
          Privacy Policy
        </h2>

        <p class="mt-2 text-gray-800 dark:text-gray-400">
          We, the University of Giessen represented by its President, take the protection of your personal data very
          seriously and strictly adhere to the rules of data protection laws. The following statement gives you an
          overview
          of what kind of personal data is collected, for what purpose and how long it is stored.
        </p>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          1. Responsible
        </h3>
        <div><strong>Responsible for data processing is:</strong></div>
        <div>President of the</div>
        <div>Justus-Liebig-University Giessen</div>
        <div>Ludwigstraße 23</div>
        <div>35390 Giessen</div>
        <div>Germany</div>
        <div>
          <NuxtLink
            class="inline-flex items-center gap-x-1 text-sm font-semibold rounded-lg border border-transparent text-arunaPrimary hover:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            to="mailto:support@aruna-storage.org" target="_blank">
            <IconMail class="flex-shrink-0 size-4" /> support@aruna-storage.org
          </NuxtLink>
        </div>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          2. Collection of personal data
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          We collect personal data from you when you register for an account or join the mailing-list on our
          website. <br />The following personal data is collected:
        </p>
        <ul class="list-disc list-inside p-4">
          <li>A self-selected name</li>
          <li>Email address for contact</li>
        </ul>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          3. Purpose of data processing
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          The personal data provided by you is exclusively used for the creation of your account. If an email address is
          provided, we will inform you about account-related events. If you join the mailing-list, we will send you
          information about the project in irregular intervals.
        </p>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          4. Legal basis for data processing
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          The legal basis for the processing of your personal data for the creation of your account is Art. 6 para. 1
          lit. b
          GDPR.
        </p>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          5. Storage period of the data
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          Your personal data will be stored for the duration of your account with us. If you delete your account,
          your data will be deleted immediately.
        </p>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          6. Your rights as a data subject
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          You have the right to request information about the personal data stored by us as well as the right to
          correction,
          deletion and restriction of the processing of your personal data (Art. 15, 16 and 18 of the European General
          Data
          Protection Regulation). If you believe that the processing of data is unlawful, you can lodge a complaint with
          the
          Hessian Data Protection Officer (Art. 77 of the European General Data Protection Regulation, §55 of the
          Hessian
          Data Protection and Freedom of Information Act). Furthermore, you are entitled to revoke your consent to the
          processing of data and to request the deletion of your data, while the processing of data until then remains
          lawful (Art. 7 para. 3 and Art. 17. EU-GDPR). You can also request the transmission of your data in portable
          form
          or have it transferred to another controller (Art. 20 EU-GDPR).
        </p>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          7. Contact
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          If you have any questions about the collection, processing or use of your personal data, please contact us by
          email at
          <NuxtLink
            class="inline-flex items-center gap-x-1 text-sm font-semibold rounded-lg border border-transparent text-arunaPrimary hover:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            to="mailto:datenschutz@aruna-storage.org" target="_blank">
            <IconMail class="flex-shrink-0 size-4" /> datenschutz@aruna-storage.org
          </NuxtLink>.
        </p>

        <h3 class="mt-4 mb-2 text-xl font-medium uppercase text-gray-600 dark:text-gray-500">
          8. Data Protection Officer
        </h3>
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          <strong>
            The contact details of the official data protection officers at Justus Liebig University are:
          </strong>
        </p>
        <div>Justus-Liebig-Universität Gießen</div>
        <div>Der behördliche Datenschutzbeauftragte</div>
        <div>Ludwigstraße 23</div>
        <div>35390 Gießen</div>
        <div>Tel: 0641-99 122 30 / 0641-99 122 70</div>
        <NuxtLink
          class="inline-flex items-center gap-x-1 text-sm font-semibold rounded-lg border border-transparent text-arunaPrimary hover:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
          to="mailto:datenschutz@aruna-storage.org" target="_blank">
          <IconMail class="flex-shrink-0 size-4" /> datenschutz@aruna-storage.org
        </NuxtLink>
        <div>Last updated: 20. April 2023</div>
        <hr class="border-gray-200 my-5">
        <p class="mt-2 text-gray-800 dark:text-gray-400">
          Please note that this privacy policy may be changed at any time. You can find the current version on
          this website.
        </p>
      </div>
    </div>
  </div>
  <Footer />
</template>