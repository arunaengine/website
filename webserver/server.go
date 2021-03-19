package webserver

import (
	"fmt"
	"html/template"
	"net/http"
	"os"

	log "github.com/sirupsen/logrus"

	csrf "github.com/MariusDieckmann/gin-csrf"
	"github.com/ScienceObjectsDB/Website/client"
	"github.com/ScienceObjectsDB/Website/middleware"
	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/multitemplate"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
)

//WebServer Handles the website
type WebServer struct {
	ServerEndpoints Endpoints
}

// Run Starts the web server
func (server *WebServer) Run() {

	host := viper.GetString("Endpoints.DatasetHandler.Host")
	if host == "" {
		err := fmt.Errorf("Endpoints datasethandler host needs to be set")
		log.Fatalln(err.Error())
	}

	port := viper.GetInt("Endpoints.DatasetHandler.Port")
	if port == 0 {
		err := fmt.Errorf("Endpoints datasethandler port needs to be set")
		log.Fatalln(err.Error())
	}

	grpcEndpoints, err := client.New(host, port)
	if err != nil {
		log.Fatalln(err.Error())
	}

	authHandler := middleware.AuthHandler{}
	authHandler.Init()

	serverEndpoints := Endpoints{
		GRPCEndpointsBackend: grpcEndpoints,
		AuthHandler:          &authHandler,
	}

	server.ServerEndpoints = serverEndpoints

	router := server.routes()

	router.Use(cors.New(cors.Config{
		AllowAllOrigins: true,
		AllowMethods:    []string{"DELETE"},
	}))

	router.Run(":8080")
}

//
func (server *WebServer) routes() *gin.Engine {
	router := gin.Default()

	router.HTMLRender = createMyRender()
	router.Static("./static", "./static")

	cookieSecret := os.Getenv("cookiesecret")
	if cookieSecret == "" {
		err := fmt.Errorf("Cookie secret needs to be set")
		log.Fatalln(err.Error())
	}

	csrfsecret := os.Getenv("csrfsecret")
	if cookieSecret == "" {
		err := fmt.Errorf("csrf secret needs to be set")
		log.Fatalln(err.Error())
	}

	store := cookie.NewStore([]byte("secret"))
	router.Use(sessions.Sessions("biodatadbwebui", store))
	router.Use(csrf.Middleware(csrf.Options{
		Secret: csrfsecret,
	}))

	router.GET("/", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/index")
	})

	router.GET("/index", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", gin.H{
			"title": "Main website",
		})
	})

	authHandlerGroup := router.Group("/auth")

	authHandlerGroup.GET("/login", server.ServerEndpoints.Login)
	authHandlerGroup.GET("/callback", server.ServerEndpoints.Callback)
	//authHandlerGroup.GET("/user", server.ServerEndpoints.GetUsername)

	projectGroup := router.Group("")
	projectGroup.Use(server.ServerEndpoints.AuthHandler.CheckToken)

	projectGroup.GET("/userdashboard", server.ServerEndpoints.UserDashboard)
	projectGroup.GET("/createProject", server.ServerEndpoints.CreateNewProjectForm)
	projectGroup.POST("/createProject", server.ServerEndpoints.CreateNewProject)
	projectGroup.DELETE("/project/:projectid", server.ServerEndpoints.DeleteProject)
	projectGroup.GET("/project/:projectid/datasets", server.ServerEndpoints.ListDatasets)
	projectGroup.GET("/project/:projectid/adduser", server.ServerEndpoints.AddUserToProjectForm)
	projectGroup.POST("project/:projectid/adduser", server.ServerEndpoints.AddUserToProject)

	dataHandlerGroup := router.Group("/")
	dataHandlerGroup.Use(server.ServerEndpoints.AuthHandler.CheckToken)

	dataHandlerGroup.DELETE("/dataset/delete/:id", server.ServerEndpoints.DeleteDatasets)

	dataHandlerGroup.GET("/dataset/details/:id", server.ServerEndpoints.ListDatasetVersion)
	dataHandlerGroup.GET("/dataset/objectgroups", server.ServerEndpoints.GetDatasetObjectGroups)
	dataHandlerGroup.GET("/datasetversion/details", server.ServerEndpoints.GetDatasetVersionObjectGroups)

	dataHandlerGroup.GET("/project/:projectid/dataset/new", server.ServerEndpoints.CreateDatasetForm)
	dataHandlerGroup.POST("/project/:projectid/dataset/new", server.ServerEndpoints.CreateDataset)

	dataHandlerGroup.GET("/datasetversion/new", server.ServerEndpoints.CreateDatasetVersionForm)
	dataHandlerGroup.POST("/datasetversion/new", server.ServerEndpoints.CreateDatasetVersion)

	dataHandlerGroup.GET("/objects", server.ServerEndpoints.GetObjects)
	dataHandlerGroup.GET("/object/:id/link", server.ServerEndpoints.GetObjectLink)

	dataHandlerGroup.GET("objectGroup/:id/link", server.ServerEndpoints.GetObjectGroupLinks)

	return router
}

func createMyRender() multitemplate.Renderer {
	r := multitemplate.NewRenderer()

	r.AddFromFiles("index.html", "templates/index.html", "templates/baseTopBar.html", "templates/baseHeader.html")
	r.AddFromFiles("datasets.html", "templates/datasets.html", "templates/baseTopBar.html", "templates/baseHeader.html")
	r.AddFromFiles("createDataset.html", "templates/createDataset.html", "templates/baseTopBar.html", "templates/baseHeader.html")
	r.AddFromFiles("createDatasetVersion.html", "templates/createDatasetVersion.html", "templates/baseTopBar.html", "templates/baseHeader.html")
	r.AddFromFiles("createProject.html", "templates/createProject.html", "templates/baseTopBar.html", "templates/baseHeader.html")
	r.AddFromFiles("userDashboard.html", "templates/userDashboard.html", "templates/baseTopBar.html", "templates/baseHeader.html")

	r.AddFromFiles("project/addUser.html", "templates/project/addUser.html", "templates/baseTopBar.html", "templates/baseHeader.html")

	r.AddFromFilesFuncs("datasetObjectGroups.html", template.FuncMap{"formatAsVersion": formatAsVersion}, "templates/datasetObjectGroups.html", "templates/baseTopBar.html", "templates/baseHeader.html")
	r.AddFromFilesFuncs("objects.html", template.FuncMap{"formatAsVersion": formatAsVersion}, "templates/objects.html", "templates/baseTopBar.html", "templates/baseHeader.html")

	r.AddFromFilesFuncs("tokenList.html", template.FuncMap{"formatAsDate": formatAsDate}, "templates/tokenList.html", "templates/baseTopBar.html", "templates/baseHeader.html")

	r.AddFromFilesFuncs("datasetDetails.html", template.FuncMap{"formatAsVersion": formatAsVersion}, "templates/datasetDetails.html", "templates/baseTopBar.html", "templates/baseHeader.html")

	r.AddFromFilesFuncs("datasetVersionDetails.html", template.FuncMap{"formatAsVersion": formatAsVersion}, "templates/datasetVersionDetails.html", "templates/baseTopBar.html", "templates/baseHeader.html")
	return r
}
