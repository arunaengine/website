package authz

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"

	"github.com/golang-jwt/jwt/v4"
	"github.com/spf13/viper"
)

type JWTHandler struct {
	verifyKey *rsa.PublicKey
}

type CustomClaim struct {
	UserGroups []string `json:"groups"`
	jwt.StandardClaims
}

type KeycloakRealmInfo struct {
	Realm  string `json:"realm"`
	PubKey string `json:"public_key"`
}

func NewJWTHandler() (*JWTHandler, error) {
	handler := &JWTHandler{}

	var key *rsa.PublicKey
	pubPEM, err := handler.GetCert()
	if err != nil {
		log.Fatalln(err.Error())
	}

	block, _ := pem.Decode([]byte(pubPEM))
	if block == nil {
		panic("failed to parse PEM block containing the public key")
	}

	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		panic("failed to parse DER encoded public key: " + err.Error())
	}

	switch pub := pub.(type) {
	case *rsa.PublicKey:
		key = pub
	default:
		return nil, errors.New("unknown type of public key")
	}

	handler.verifyKey = key

	return handler, nil
}

func (handler *JWTHandler) VerifyAndParseToken(token string) (*jwt.Token, error) {
	claims := &CustomClaim{
		UserGroups:     make([]string, 0),
		StandardClaims: jwt.StandardClaims{},
	}

	parsedToken, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (interface{}, error) {
		return handler.verifyKey, nil
	})
	if err != nil {
		log.Println(err.Error())
		return nil, err
	}

	if !parsedToken.Valid {
		return nil, errors.New("could not verify token")
	}

	return parsedToken, nil
}

func (handler *JWTHandler) GetCert() (string, error) {
	realmInfoEndpoint := viper.GetString("Auth.URL")
	response, err := http.DefaultClient.Get(realmInfoEndpoint)
	if err != nil {
		log.Println(err.Error())
		return "", err
	}

	if response.StatusCode != http.StatusOK {
		err := fmt.Errorf("could not read realm info endoint")
		log.Println(err.Error())
		return "", err
	}

	data, err := ioutil.ReadAll(response.Body)
	if err != nil {
		log.Println(err.Error())
		return "", err
	}

	realmInfo := &KeycloakRealmInfo{}
	err = json.Unmarshal(data, realmInfo)
	if err != nil {
		log.Println(err.Error())
		return "", err
	}

	pubPEM := "-----BEGIN RSA PUBLIC KEY-----\n" + realmInfo.PubKey + "\n-----END RSA PUBLIC KEY-----"

	return pubPEM, nil

}
