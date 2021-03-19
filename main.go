package main

import (
	"github.com/ScienceObjectsDB/Website/webserver"
	log "github.com/sirupsen/logrus"

	"github.com/jessevdk/go-flags"
	"github.com/spf13/viper"
)

var opts struct {
	ConfigFile string `short:"c" long:"configfile" description:"File of the config file" default:"config/local/config.yaml"`
}

func main() {

	_, err := flags.Parse(&opts)
	if err != nil {
		log.Fatalln(err.Error())
	}

	viper.SetConfigFile(opts.ConfigFile)
	err = viper.ReadInConfig()
	if err != nil {
		log.Fatalln(err.Error())
	}

	webserver := webserver.WebServer{}
	webserver.Run()
}
