package webserver

import (
	"encoding/base64"
	"encoding/json"
	"net/http"

	log "github.com/sirupsen/logrus"

	"github.com/gin-gonic/gin"
)

// Login login endpoint
func (server *Endpoints) Login(c *gin.Context) {
	server.AuthHandler.Auth(c)
}

// Callback callback handling for oauth2 login
func (server *Endpoints) Callback(c *gin.Context) {
	state := c.Query("state")
	code := c.Query("code")

	token, err := server.AuthHandler.GetAccessToken(state, code)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	marshalledToken, err := json.Marshal(token)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	tokenString := base64.StdEncoding.EncodeToString(marshalledToken)

	c.SetCookie("token", tokenString, 15*60*60, "/", "", true, true)

	c.Redirect(http.StatusMovedPermanently, "/userdashboard")
	c.Abort()
}
