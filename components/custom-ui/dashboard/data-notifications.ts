export const v3_events = [
  {
    "type": "RegisterUserRequestTx",
    "id": "01JDPGX26PDFD4Y3771K28MPN5",
    event_id: "01JDPGX26PA5C40MV8T7NNBFK9",
    "req": {
      "email": "admin@test.com",
      "first_name": "aruna",
      "last_name": "admin",
      "identifier": ""
    },
    "requester": {
      "Unregistered": {
        "oidc_realm": "http://localhost:1998/realms/test",
        "oidc_subject": "14f0e7bf-0947-4aa1-a8cd-337ddeff4573"
      }
    }
  },
  {
    "type": "CreateComponentRequestTx",
    "id": "01JDQ7PRHD2FWKF6Y34CWPHKSQ",
    event_id: "01JDQ7PRHDWYH99R8PGCQ96CN6",
    "req": {
      "name": "proxy",
      "description": "A proxy",
      "component_type": "Data",
      "endpoints": [
        {
          "S3": "https://example.com/"
        }
      ],
      "pubkey": "string",
      "public": true
    },
    "requester": {
      "User": {
        "user_id": "01JDPGX26PDFD4Y3771K28MPN5",
        "auth_method": {
          "Aruna": 0
        },
        "impersonated_by": null
      }
    }
  }
]
