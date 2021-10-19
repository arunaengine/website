package webserver

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"strconv"

	models "github.com/ScienceObjectsDB/go-api/api/models/v1"
	services "github.com/ScienceObjectsDB/go-api/api/services/v1"

	"github.com/ScienceObjectsDB/Website/client"
	"github.com/ScienceObjectsDB/Website/middleware"
	log "github.com/sirupsen/logrus"

	"github.com/spf13/viper"
	"golang.org/x/oauth2"

	csrf "github.com/MariusDieckmann/gin-csrf"
	"github.com/gin-gonic/gin"
	"github.com/golang/protobuf/ptypes/timestamp"
)

// Endpoints Endpoints of the webUI
type Endpoints struct {
	GRPCEndpointsBackend *client.GrpcClients
	AuthHandler          *middleware.AuthHandler
}

// ID binds string based ids
type ID struct {
	ID string `uri:"id" binding:"required"`
}

// ProjectID binds the project id
type ProjectID struct {
	ProjectID string `uri:"projectid" binding:"required"`
}

type CreateProject struct {
	ProjectName        string `form:"projectname" binding:"required"`
	ProjectDescription string `form:"description" binding:"required"`
}

type AddUserToProject struct {
	UserID string `form:"userid" binding:"required"`
}

// CreateDataset Data required to create a dataset
type CreateDataset struct {
	DatasetName string `form:"datasetname"`
	DatasetType string `form:"datasettype"`
}

// CreateDatasetVersion Data required to create a dataset version
type CreateDatasetVersion struct {
	DatasetName string `form:"datasetname"`
	Major       string `form:"majorversion"`
	Minor       string `form:"minorversion"`
	Patch       string `form:"patchversion"`
	Stage       string `form:"stageversion"`
}

type Userinfo struct {
	Sub      string `json:"sub"`
	Username string `json:"preferred_username"`
}

const UNAUTHORIZEDERROR = "rpc error: code = Unknown desc = bad reponse when requesting userinfo: 401 Unauthorized"

// CreateDataset Creates a new dataset
func (server *Endpoints) CreateDataset(c *gin.Context) {
	var projectID ProjectID

	err := c.BindUri(&projectID)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	err = c.Request.ParseForm()
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	var createDatasetData CreateDataset

	err = c.Bind(&createDatasetData)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	_, err = server.GRPCEndpointsBackend.DatasetClient.CreateDataset(server.GRPCEndpointsBackend.OutGoingContext(c), &services.CreateDatasetRequest{
		ProjectId: projectID.ProjectID,
		Name:      createDatasetData.DatasetName,
	})

	server.ListDatasets(c)
}

// CreateDatasetForm creates a new dataset
func (server *Endpoints) CreateDatasetForm(c *gin.Context) {
	csrfToken := csrf.GetToken(c)

	c.HTML(http.StatusOK, "createDataset.html", gin.H{"csrfToken": csrfToken})
}

// CreateDatasetVersion Creates a new dataset
func (server *Endpoints) CreateDatasetVersion(c *gin.Context) {
	var datasetid string
	var exists bool

	if datasetid, exists = c.GetQuery("datasetid"); !exists {
		err := fmt.Errorf("Could not find datasetid in query params")
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	err := c.Request.ParseForm()
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	var createDatasetData CreateDatasetVersion

	err = c.Bind(&createDatasetData)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	majorVersionInt, err := strconv.Atoi(createDatasetData.Major)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	minorVersionInt, err := strconv.Atoi(createDatasetData.Minor)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	patchVersionInt, err := strconv.Atoi(createDatasetData.Patch)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	var stageVersion models.Version_VersionStage
	switch createDatasetData.Stage {
	case "alpha":
		stageVersion = models.Version_ALPHA
	case "beta":
		stageVersion = models.Version_BETA
	case "stable":
		stageVersion = models.Version_STABLE
	case "rc":
		stageVersion = models.Version_RC
	default:
		err := fmt.Errorf("Could not parse stage version")
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	version := models.Version{
		Major: int32(majorVersionInt),
		Minor: int32(minorVersionInt),
		Patch: int32(patchVersionInt),
		Stage: stageVersion,
	}

	_, err = server.GRPCEndpointsBackend.DatasetClient.ReleaseDatasetVersion(server.GRPCEndpointsBackend.OutGoingContext(c), &services.ReleaseDatasetVersionRequest{
		DatasetId: datasetid,
		Version:   &version,
	})

	c.Redirect(http.StatusMovedPermanently, fmt.Sprintf("/dataset/details/%v", datasetid))
	c.Abort()
}

// CreateDatasetVersionForm creates a new dataset
func (server *Endpoints) CreateDatasetVersionForm(c *gin.Context) {
	var datasetid string
	var exists bool

	if datasetid, exists = c.GetQuery("datasetid"); !exists {
		err := fmt.Errorf("Could not find datasetid in query params")
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	csrfToken := csrf.GetToken(c)

	c.HTML(http.StatusOK, "createDatasetVersion.html", gin.H{"datasetid": datasetid, "csrfToken": csrfToken})
}

// ListDatasets Lists all datasets for a user
func (server *Endpoints) ListDatasets(c *gin.Context) {
	var projectID ProjectID

	if err := c.ShouldBindUri(&projectID); err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	id := services.GetProjectDatasetsRequest{
		Id: projectID.ProjectID,
	}

	datasets, err := server.GRPCEndpointsBackend.ProjectClient.GetProjectDatasets(server.GRPCEndpointsBackend.OutGoingContext(c), &id)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	csrfToken := csrf.GetToken(c)
	c.HTML(http.StatusOK, "datasets.html", gin.H{"dataset": datasets.GetDataset(), "csrfToken": csrfToken, "projectid": projectID.ProjectID})
}

// DeleteDatasets Deletes a dataset
func (server *Endpoints) DeleteDatasets(c *gin.Context) {
	var datasetID ID

	if err := c.ShouldBindUri(&datasetID); err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	_, err := server.GRPCEndpointsBackend.DatasetClient.DeleteDataset(server.GRPCEndpointsBackend.OutGoingContext(c), &services.DeleteDatasetRequest{Id: datasetID.ID})
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}
}

// ListDatasetVersion Lists all versions of a dataset
func (server *Endpoints) ListDatasetVersion(c *gin.Context) {
	var datasetID ID

	if err := c.ShouldBindUri(&datasetID); err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	id := services.GetDatasetVersionsRequest{
		Id: datasetID.ID,
	}

	currentDatasetVersion := &models.DatasetVersion{}

	datasetversions, err := server.GRPCEndpointsBackend.DatasetClient.GetDatasetVersions(server.GRPCEndpointsBackend.OutGoingContext(c), &id)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	csrfToken := csrf.GetToken(c)
	c.HTML(http.StatusOK, "datasetDetails.html", gin.H{"currentdatasetversion": currentDatasetVersion, "dataset": datasetversions.DatasetVersions, "datasetid": datasetID.ID, "csrfToken": csrfToken})
}

// ListDatasetVersionObjects Lists all objects of a dataset version
func (server *Endpoints) ListDatasetVersionObjects(c *gin.Context) {
	var datasetVersionID ID

	if err := c.ShouldBindUri(&datasetVersionID); err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	objectGroups, err := server.GRPCEndpointsBackend.DatasetClient.GetDatasetVersion(server.GRPCEndpointsBackend.OutGoingContext(c), &services.GetDatasetVersionRequest{Id: datasetVersionID.ID})
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	csrfToken := csrf.GetToken(c)
	c.HTML(http.StatusOK, "datasetVersionDetails.html", gin.H{"csrfToken": csrfToken, "objectGroups": objectGroups})
}

func formatAsVersion(version *models.Version) string {
	return fmt.Sprintf("%v.%v.%v-%v.%v", version.GetMajor(), version.GetMinor(), version.GetPatch(), version.GetStage(), version.GetRevision())
}

func formatAsDate(time *timestamp.Timestamp) string {
	return time.AsTime().String()
}

func (server *Endpoints) GetObjectGroupLinks(c *gin.Context) {
	var objectGroupID ID

	if err := c.ShouldBindUri(&objectGroupID); err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	id := services.CreateDownloadLinkRequest{
		Id: objectGroupID.ID,
	}

	links, err := server.GRPCEndpointsBackend.ObjectLoadClient.CreateDownloadLink(server.GRPCEndpointsBackend.OutGoingContext(c), &id)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	c.JSON(http.StatusOK, links)
}

// GetObjectLink Creates a download link for a given object
func (server *Endpoints) GetObjectLink(c *gin.Context) {
	var objectID ID

	if err := c.ShouldBindUri(&objectID); err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	id := services.CreateDownloadLinkRequest{
		Id: objectID.ID,
	}

	link, err := server.GRPCEndpointsBackend.ObjectLoadClient.CreateDownloadLink(server.GRPCEndpointsBackend.OutGoingContext(c), &id)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	c.JSON(http.StatusOK, link)
}

func (server *Endpoints) ListProjects(c *gin.Context) {
	projectsList, err := server.GRPCEndpointsBackend.ProjectClient.GetUserProjects(server.GRPCEndpointsBackend.OutGoingContext(c), &services.GetUserProjectsRequest{})
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	c.HTML(http.StatusOK, "projects.html", gin.H{"projects": projectsList.GetProjects()})
}

func (server *Endpoints) CreateNewProject(c *gin.Context) {
	var createProjectForm CreateProject

	if err := c.Bind(&createProjectForm); err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	_, err := server.GRPCEndpointsBackend.ProjectClient.CreateProject(server.GRPCEndpointsBackend.OutGoingContext(c), &services.CreateProjectRequest{
		Name:        createProjectForm.ProjectName,
		Description: createProjectForm.ProjectDescription,
	})

	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	c.Redirect(http.StatusMovedPermanently, fmt.Sprintf("/userdashboard"))
	c.Abort()
}

func (server *Endpoints) CreateNewProjectForm(c *gin.Context) {
	csrfToken := csrf.GetToken(c)

	c.HTML(http.StatusOK, "createProject.html", gin.H{"csrfToken": csrfToken})
}

func (server *Endpoints) AddUserToProject(c *gin.Context) {
	var addUserToProjectForm AddUserToProject

	var projectid ProjectID

	if err := c.Bind(&addUserToProjectForm); err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	if err := c.ShouldBindUri(&projectid); err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	_, err := server.GRPCEndpointsBackend.ProjectClient.AddUserToProject(server.GRPCEndpointsBackend.OutGoingContext(c), &services.AddUserToProjectRequest{
		ProjectId: projectid.ProjectID,
		UserId:    addUserToProjectForm.UserID,
		Scope:     []models.Right{models.Right_READ, models.Right_WRITE},
	})

	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	c.Redirect(http.StatusMovedPermanently, fmt.Sprintf("/userdashboard"))
	c.Abort()
}

func (server *Endpoints) AddUserToProjectForm(c *gin.Context) {
	csrfToken := csrf.GetToken(c)

	c.HTML(http.StatusOK, "project/addUser.html", gin.H{"csrfToken": csrfToken})
}

func (server *Endpoints) DeleteProject(c *gin.Context) {
	var projectID ProjectID

	if err := c.ShouldBindUri(&projectID); err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	_, err := server.GRPCEndpointsBackend.ProjectClient.DeleteProject(server.GRPCEndpointsBackend.OutGoingContext(c), &services.DeleteProjectRequest{Id: projectID.ProjectID})
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	c.Redirect(http.StatusPermanentRedirect, "/userdashboard")
	c.Abort()
}

func (server *Endpoints) UserDashboard(c *gin.Context) {
	projectsList, err := server.GRPCEndpointsBackend.ProjectClient.GetUserProjects(server.GRPCEndpointsBackend.OutGoingContext(c), &services.GetUserProjectsRequest{})
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	csrfToken := csrf.GetToken(c)

	c.HTML(http.StatusOK, "userDashboard.html", gin.H{"projects": projectsList.GetProjects(), "csrfToken": csrfToken})
}

func (server *Endpoints) GetDatasetObjectGroups(c *gin.Context) {
	var datasetid string
	var exists bool

	if datasetid, exists = c.GetQuery("datasetid"); !exists {
		err := fmt.Errorf("Could not find datasetid in query params")
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	objectsGroups, err := server.GRPCEndpointsBackend.DatasetClient.GetDatasetObjectGroups(server.GRPCEndpointsBackend.OutGoingContext(c), &services.GetDatasetObjectGroupsRequest{
		Id: datasetid,
	})
	if err != nil {
		if err.Error() == UNAUTHORIZEDERROR {
			c.Redirect(http.StatusPermanentRedirect, "/auth/login")
			return
		}
		log.Println(err.Error())
		c.AbortWithStatus(400)
		return
	}

	csrfToken := csrf.GetToken(c)

	c.HTML(200, "datasetObjectGroups.html", gin.H{"objectgroups": objectsGroups.GetObjectGroups(), "csrfToken": csrfToken})
}

func (server *Endpoints) GetDatasetVersionObjectGroups(c *gin.Context) {
	var datasetversionid string
	var exists bool

	if datasetversionid, exists = c.GetQuery("datasetversionid"); !exists {
		err := fmt.Errorf("could not find datasetversionid in query params")
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	objectsGroupVersions, err := server.GRPCEndpointsBackend.DatasetClient.GetDatasetVersion(server.GRPCEndpointsBackend.OutGoingContext(c), &services.GetDatasetVersionRequest{
		Id: datasetversionid,
	})
	if err != nil {
		if err.Error() == UNAUTHORIZEDERROR {
			c.Redirect(http.StatusPermanentRedirect, "/auth/login")
			return
		}
		log.Println(err.Error())
		c.AbortWithStatus(400)
		return
	}

	csrfToken := csrf.GetToken(c)

	c.HTML(200, "datasetObjectGroups.html", gin.H{"objectgroups": objectsGroupVersions.GetDatasetVersion().ObjectGroupIds, "csrfToken": csrfToken})
}

func (server *Endpoints) GetObjects(c *gin.Context) {
	c.AbortWithStatus(400)
}

func (server *Endpoints) ListProjectTokens(c *gin.Context) {
	var projectID ProjectID

	if err := c.ShouldBindUri(&projectID); err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	tokenList, err := server.GRPCEndpointsBackend.ProjectClient.GetAPIToken(server.GRPCEndpointsBackend.OutGoingContext(c), &services.GetAPITokenRequest{})
	if err != nil {
		c.AbortWithError(400, err)
	}

	var projectToken []*models.APIToken

	for _, token := range tokenList.Token {
		if token.ProjectId == projectID.ProjectID {
			projectToken = append(projectToken, token)
		}
	}

	c.HTML(200, "tokenList.html", gin.H{"token": projectToken, "projectid": projectID.ProjectID})
}

func (server *Endpoints) CreateProjectToken(c *gin.Context) {
	var projectID ProjectID
	if err := c.ShouldBindUri(&projectID); err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
		return
	}

	_, err := server.GRPCEndpointsBackend.ProjectClient.CreateAPIToken(server.GRPCEndpointsBackend.OutGoingContext(c), &services.CreateAPITokenRequest{
		Id: projectID.ProjectID,
	})
	if err != nil {
		c.AbortWithError(400, err)
	}

	c.Redirect(http.StatusTemporaryRedirect, fmt.Sprintf("/project/%v/apitoken/list", projectID.ProjectID))
	c.Abort()
}

func (server *Endpoints) GetUsername(c *gin.Context) {
	rawTokenCookie, err := c.Request.Cookie("token")
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	unescapedBase64Data, err := url.QueryUnescape(rawTokenCookie.Value)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	rawBytesDecoded, err := base64.StdEncoding.DecodeString(unescapedBase64Data)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	var token oauth2.Token
	err = json.Unmarshal(rawBytesDecoded, &token)
	if err != nil && err != http.ErrNoCookie {
		log.Println(err.Error())
		c.AbortWithError(400, err)
	}

	userinfo := viper.GetString("Auth.UserInfoURL")

	req, err := http.NewRequest(
		"GET",
		userinfo,
		http.NoBody,
	)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithStatus(400)
		return
	}

	req.Header.Add("Authorization", "Bearer "+token.AccessToken)

	response, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithStatus(400)
		return
	}
	defer response.Body.Close()
	contents, err := ioutil.ReadAll(response.Body)
	if err != nil {
		log.Println(err.Error())
		c.AbortWithStatus(400)
		return
	}

	c.Data(200, "application/json", contents)
}
