package middleware

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"

	log "github.com/sirupsen/logrus"

	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
	"golang.org/x/oauth2"
)

type AuthHandler struct {
	Oauth2Conf   *oauth2.Config
	Oauth2String string
}

// Init Initializes the auth handler object
func (handler *AuthHandler) Init() {
	clientID := viper.GetString("Auth.ClientID")
	callbackURL := viper.GetString("Auth.CallbackURL")
	AuthURL := viper.GetString("Auth.AuthURL")
	TokenURL := viper.GetString("Auth.TokenURL")

	oauth2Conf := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: os.Getenv("Oauth2ClientSecret"),
		RedirectURL:  callbackURL,
		Endpoint: oauth2.Endpoint{
			AuthURL:  AuthURL,
			TokenURL: TokenURL,
		},
		Scopes: []string{"profile", "email"},
	}
	handler.Oauth2Conf = oauth2Conf

	handler.Oauth2String = "test"
}

// Auth Used to authenticate call and login
func (handler *AuthHandler) Auth(c *gin.Context) {
	c.Redirect(http.StatusMovedPermanently, handler.Oauth2Conf.AuthCodeURL("test", oauth2.AccessTypeOffline))
	c.Abort()
}

// GetAccessToken Returns the token of a login request
func (handler *AuthHandler) GetAccessToken(state string, code string) (*oauth2.Token, error) {
	if state != handler.Oauth2String {
		return nil, fmt.Errorf("invalid oauth state")
	}
	token, err := handler.Oauth2Conf.Exchange(oauth2.NoContext, code)
	if err != nil {
		return nil, fmt.Errorf("code exchange failed: %s", err.Error())
	}

	return token, nil
}

func (handler *AuthHandler) GetUserInfo(state string, code string) ([]byte, error) {
	if state != handler.Oauth2String {
		return nil, fmt.Errorf("invalid oauth state")
	}
	token, err := handler.Oauth2Conf.Exchange(oauth2.NoContext, code)
	if err != nil {
		return nil, fmt.Errorf("code exchange failed: %s", err.Error())
	}

	userinfo := viper.GetString("UserInfoURL")

	req, err := http.NewRequest(
		"GET",
		userinfo,
		http.NoBody,
	)
	if err != nil {
		log.Println(err.Error())
		return nil, err
	}

	req.Header.Add("Authorization", "Bearer "+token.AccessToken)

	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed getting user info: %s", err.Error())
	}
	defer response.Body.Close()
	contents, err := ioutil.ReadAll(response.Body)
	if err != nil {
		return nil, fmt.Errorf("failed reading response body: %s", err.Error())
	}
	return contents, nil
}

func (handler *AuthHandler) CheckToken(c *gin.Context) {
	rawTokenCookie, err := c.Request.Cookie("token")
	if err != nil {
		log.Println(err.Error())
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithError(400, err)
	}

	unescapedBase64Data, err := url.QueryUnescape(rawTokenCookie.Value)
	if err != nil {
		log.Println(err.Error())
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithError(400, err)
	}

	rawBytesDecoded, err := base64.StdEncoding.DecodeString(unescapedBase64Data)
	if err != nil {
		log.Println(err.Error())
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithError(400, err)
	}

	var token oauth2.Token
	err = json.Unmarshal(rawBytesDecoded, &token)
	if err != nil && err != http.ErrNoCookie {
		log.Println(err.Error())
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithError(400, err)
	}

	updatedToken, err := handler.Oauth2Conf.TokenSource(context.TODO(), &token).Token()
	if err != nil {
		log.Println(err.Error())
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithError(400, err)
	}

	updatedRawToken, err := json.Marshal(updatedToken)
	if err != nil {
		log.Println(err.Error())
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithError(400, err)
	}

	rawTokenCookie.Value = string(updatedRawToken)

	c.Next()
}
