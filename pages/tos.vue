<template>
  <NavigationTop />

  <div class="container mx-auto mt-4 p-4 border-2 border-aruna-text/50 rounded-md bg-aruna-bg/90">

    <Tabs default-value="agb"
          class="w-full">
      <TabsList class="rounded-sm border border-aruna-text/50">
        <TabsTrigger value="agb"
                     class="rounded-sm text-aruna-text data-[state=active]:bg-aruna-bg/90 data-[state=active]:text-aruna-text-accent">
          Nutzungsbedingungen
        </TabsTrigger>
        <TabsTrigger value="tos"
                     class="rounded-sm text-aruna-text data-[state=active]:bg-aruna-bg/90 data-[state=active]:text-aruna-text-accent">
          Terms of Service
        </TabsTrigger>
      </TabsList>

      <Separator class="bg-aruna-text/50 my-4"/>

      <TabsContent value="agb">
        <h1 class="text-3xl font-bold text-aruna-text-accent uppercase">
          Nutzungsbedingungen
        </h1>
        <p class="mt-2 text-aruna-text">
          Die Nutzungsbedingungen regeln die Nutzung der Aruna Object Storage Plattform, im folgenden als Aruna
          bezeichnet, zur Speicherung von Forschungsdaten und dazugehörigen Metadaten. Der Betreiber, im folgenden als
          Betreiber bezeichnet, ist die Professur für Bioinformatik und Systembiologie der Justus-Liebig-Universität
          Gießen. Die Nutzungsbedingungen sind für alle Nutzenden bindend, unabhängig davon, wie der Zugang erfolgt.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Zustimmung zur Nutzung
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          Durch die Nutzung des Aruna Services erklären Sie sich damit einverstanden, diese Nutzungsbedingungen
          einzuhalten und akzeptieren sie als rechtliche Vereinbarung zwischen Ihnen und dem Betreiber des Aruna
          Services.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Nutzungsberechtigung
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          Sie erklären und garantieren, dass Sie berechtigt sind, die Forschungsdaten und Metadaten, die Sie über diesen
          Webservice hochladen, zu speichern und zu nutzen. Sie tragen die alleinige Verantwortung für die von Ihnen
          hochgeladenen Daten.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Verfügbarkeit
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          Zur Aufgabe der Betreiber gehört unter anderem die Planung, die Bereitstellung, der Betrieb, die Wartung und
          die Pflege des Aruna Services. Diese Leistungen werden im Rahmen der Ausstattung insbesondere bezüglich
          Personal sowie Compute- und Storage Ressourcen erbracht. Es können keine Garantien bzgl. der Verfügbarkeit und
          Fehlerfreiheit gegeben werden. Inbesondere wird kein Service Level vereinbart.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Datenschutz und Vertraulichkeit
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          Wir verpflichten uns, die von Ihnen hochgeladenen Forschungsdaten und Metadaten vertraulich zu behandeln. Wir
          geben Ihre Daten nicht ohne Ihre ausdrückliche Zustimmung an Dritte weiter, es sei denn, dies ist gesetzlich
          vorgeschrieben oder erforderlich, um den Webservice bereitzustellen.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Sicherheit
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          Wir setzen angemessene technische und organisatorische Maßnahmen ein, um die Sicherheit Ihrer Forschungsdaten
          und Metadaten zu gewährleisten und unbefugten Zugriff, unbefugte Offenlegung oder Datenverlust zu verhindern.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Geistiges Eigentum
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          Sie behalten das geistige Eigentum an den von Ihnen hochgeladenen Forschungsdaten und Metadaten. Sie gewähren
          uns jedoch eine nicht-exklusive, weltweite Lizenz zur Nutzung, Vervielfältigung und Anzeige Ihrer Daten und
          Metadaten im Rahmen des Betriebs und der Bereitstellung des Aruna Services
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Haftungsausschluss
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          Wir übernehmen keine Haftung für Verluste oder Schäden, die Ihnen durch die Nutzung des Aruna Services
          entstehen könnten, es sei denn, diese resultieren aus grober Fahrlässigkeit oder Vorsatz seitens des
          Betreibers des Aruna Services.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Datenlöschung
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          Sie haben das Recht, uns aufzufordern, Ihre Forschungsdaten und Metadaten zu löschen. Wir werden Ihre Daten
          innerhalb einer angemessenen Frist nach Erhalt einer solchen Anfrage löschen, sofern keine rechtlichen oder
          berechtigten Gründe für die Aufbewahrung der Daten vorliegen.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Änderungen der Nutzungsbedingungen
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          Wir behalten uns das Recht vor, diese Nutzungsbedingungen jederzeit zu ändern. Wir werden Sie über Änderungen
          informieren, indem wir die überarbeiteten Bedingungen auf unserer Website veröffentlichen. Die fortgesetzte
          Nutzung des Webservices nach solchen Änderungen gilt als Zustimmung zu den aktualisierten Nutzungsbedingungen.
        </p>
      </TabsContent>
      <TabsContent value="tos">
        <h1 class="text-3xl font-bold text-aruna-text-accent">
          Terms of service
        </h1>
        <p class="mt-1 text-xl font-medium uppercase text-gray-500">
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

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Consent of use
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          By using the Aruna Service, you agree to comply with these Terms of Service and accept them as a
          legal agreement between you and the operator of the Aruna Service.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Authorization
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          By using the Aruna Service, you agree to comply with these Terms of Service and accept them as a
          legal agreement between you and the operator of the Aruna Service.
        </p>
        <p class="p-4 pt-0 text-aruna-text">
          You agree and warrant that you are authorized to store and use the research data and metadata that
          you upload through this web service. You are solely responsible for the data you upload.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Availability
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          The Operators' responsibilities include, but are not limited to, planning, providing, operating,
          maintaining and servicing the Aruna Service. These services are provided within the scope of the
          equipment, in particular with regard to personnel as well as compute and storage resources. No
          guarantees can be given with regard to availability and freedom from errors. In particular, no
          service level is agreed upon.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Data protection and confidentiality
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          We are committed to keeping the research data and metadata uploaded by you confidential. We will not
          share
          your data with third parties without your explicit consent, unless required by law or in order to be
          able to
          provide the web service.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Security
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          We have implemented appropriate technical and organizational measures to ensure the security of your
          research data and metadata preventing unauthorized access, disclosure, or loss of data.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Intellectual Property
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          You retain intellectual property rights in the research data and metadata you upload. However, you
          grant us
          a non-exclusive, worldwide license to use, reproduce and display your data and metadata in the
          course of
          operating and providing the Aruna Service.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Data Deletion
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          You have the right to request us to delete your Research Data and Metadata. We will delete your data
          within
          a reasonable period of time after receiving such request, unless there are legal or legitimate
          reasons for
          keeping the data.
        </p>

        <h3 class="mt-6 mb-2 text-xl font-bold uppercase text-aruna-text-accent">
          Changes to Terms of Service
        </h3>
        <hr class="border-aruna-text">
        <p class="mt-2 p-4 text-aruna-text">
          We reserve the right to change these Terms of Service at any time. We will notify you of changes by
          posting the revised terms on our website. Your continued use of the Web Service following such changes will
          constitute your acceptance of the updated Terms of Service.
        </p>
      </TabsContent>
    </Tabs>
  </div>

  <Footer />
</template>
<script setup lang="ts">
</script>