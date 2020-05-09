import os
import os.path
from os import path


def getSize(filename):
    st = os.stat(filename)
    return st.st_size


current = getSize('.gitignore')
deploy = getSize('gitignore-prod.sh')
save = getSize('gitignore-default.sh')

def checkValidity():

    if path.exists('.env') :
      print "deployment valid."
      os.system('./deploy-heroku.sh')
    else:
      print "deployment invalid. check if you have an .env file properly setup"

checkValidity()