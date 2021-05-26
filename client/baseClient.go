package client

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	log "github.com/sirupsen/logrus"
	"github.com/spf13/viper"

	"github.com/ScienceObjectsDB/go-api/services"
	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/metadata"
)

// TokenType Indicates the kind of token passed for authentication
type TokenType string

const (
	// AccessToken for Oauth2 authentication
	AccessToken TokenType = "AccessToken"
	// UserAPIToken for api token authentication
	UserAPIToken TokenType = "UserAPIToken"
)

//GrpcClients struct to hold the individual api clients
type GrpcClients struct {
	ProjectClient          services.ProjectAPIClient
	DatasetClient          services.DatasetServiceClient
	ObjectGroupClient      services.DatasetObjectsServiceClient
	ObjectLoadClient       services.ObjectLoadClient
	GenericOutGoingContext context.Context
}

// New Creates and initializes a new set of GRPCEndpointsClients
func New(host string, port int) (*GrpcClients, error) {
	clients := GrpcClients{}

	ctx := context.Background()
	clients.GenericOutGoingContext = ctx

	var tlsConf tls.Config

	useTLS := viper.GetViper().GetBool("Endpoints.DatasetHandler.UseTLS")

	credentials := credentials.NewTLS(&tlsConf)

	dialOptions := grpc.WithTransportCredentials(credentials)
	if !useTLS {
		dialOptions = grpc.WithInsecure()
	}

	conn, err := grpc.Dial(fmt.Sprintf("%v:%v", host, port), dialOptions)
	if err != nil {
		log.Println(err.Error())
		return nil, err
	}
	clients.createDatasetClient(conn)
	clients.createProjectClient(conn)
	clients.createLoadClient(conn)
	clients.createObjectsClient(conn)

	return &clients, nil
}

//OutGoingContext Wrapper function for legacy reasons
func (clients *GrpcClients) OutGoingContext(c *gin.Context) context.Context {
	token := clients.GetAccessTokenFromGinContext(c)
	return clients.OutGoingContextFromToken(token, AccessToken)
}

// OutGoingContextFromToken Creates the required outgoing context for a call
func (clients *GrpcClients) OutGoingContextFromToken(token string, tokentype TokenType) context.Context {
	mdMap := make(map[string]string)
	mdMap[string(tokentype)] = token
	tokenMetadata := metadata.New(mdMap)

	outgoingContext := metadata.NewOutgoingContext(context.TODO(), tokenMetadata)
	return outgoingContext
}

// GetAccessTokenFromGinContext Returns the access token of a gin context from cookie
// Token needs to be stored as "token"
func (clients *GrpcClients) GetAccessTokenFromGinContext(c *gin.Context) string {
	rawTokenCookie, err := c.Request.Cookie("token")
	if err != nil && err != http.ErrNoCookie {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	if err == http.ErrNoCookie {
		log.Println("cookie not found")
		return ""
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

	err = json.Unmarshal([]byte(rawBytesDecoded), &token)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	return token.AccessToken
}

func (clients *GrpcClients) createObjectsClient(conn *grpc.ClientConn) {
	clients.ObjectGroupClient = services.NewDatasetObjectsServiceClient(conn)
}

func (clients *GrpcClients) createLoadClient(conn *grpc.ClientConn) {
	clients.ObjectLoadClient = services.NewObjectLoadClient(conn)
}

func (clients *GrpcClients) createDatasetClient(conn *grpc.ClientConn) {
	clients.DatasetClient = services.NewDatasetServiceClient(conn)
}

func (clients *GrpcClients) createProjectClient(conn *grpc.ClientConn) {
	clients.ProjectClient = services.NewProjectAPIClient(conn)
}
