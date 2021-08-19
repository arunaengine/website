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

	"github.com/ScienceObjectsDB/Website/authz"
	log "github.com/sirupsen/logrus"

	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
	"golang.org/x/oauth2"
)

type AuthHandler struct {
	Oauth2Conf   *oauth2.Config
	Oauth2String string
	JwtHandler   *authz.JWTHandler
}

// Init Initializes the auth handler object
func (handler *AuthHandler) Init() {
	clientID := viper.GetString("Auth.ClientID")
	callbackURL := viper.GetString("Auth.CallbackURL")
	AuthURL := viper.GetString("Auth.AuthURL")
	TokenURL := viper.GetString("Auth.TokenURL")

	oauth2Conf := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: os.Getenv("OAuth2ClientSecret"),
		RedirectURL:  callbackURL,
		Endpoint: oauth2.Endpoint{
			AuthURL:  AuthURL,
			TokenURL: TokenURL,
		},
		Scopes: []string{"profile", "email", "groups"},
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
		return
	}

	unescapedBase64Data, err := url.QueryUnescape(rawTokenCookie.Value)
	if err != nil {
		log.Println(err.Error())
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithError(400, err)
		return
	}

	rawBytesDecoded, err := base64.StdEncoding.DecodeString(unescapedBase64Data)
	if err != nil {
		log.Println(err.Error())
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithError(400, err)
		return
	}

	var token oauth2.Token
	err = json.Unmarshal(rawBytesDecoded, &token)
	if err != nil && err != http.ErrNoCookie {
		log.Println(err.Error())
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithError(400, err)
		return
	}

	updatedToken, err := handler.Oauth2Conf.TokenSource(context.TODO(), &token).Token()
	if err != nil {
		log.Println(err.Error())
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithError(400, err)
		return
	}

	updatedRawToken, err := json.Marshal(updatedToken)
	if err != nil {
		log.Println(err.Error())
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithError(400, err)
		return
	}

	parsedToken, err := handler.JwtHandler.VerifyAndParseToken(token.AccessToken)
	if err != nil {
		log.Println(err.Error())
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithError(400, err)
		return
	}

	var ok bool
	var claims *authz.CustomClaim

	if claims, ok = parsedToken.Claims.(*authz.CustomClaim); !ok || !parsedToken.Valid {
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithError(400, err)
		return
	}

	isInGroup := false
	for _, group := range claims.UserGroups {
		if group == "/sciobjsdb-test" {
			isInGroup = true
			break
		}
	}

	if !isInGroup {
		c.Redirect(http.StatusTemporaryRedirect, "/index")
		c.AbortWithStatus(403)
		return
	}

	rawTokenCookie.Value = string(updatedRawToken)

	c.Next()
}
