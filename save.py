import os
import os.path
from os import path


def getSize(filename):
    st = os.stat(filename)
    return st.st_size


current = getSize('.gitignore')
deploy = getSize('gitignore-prod.sh')
save = getSize('gitignore-default.sh')

def tryDeployment():

    if current == save:
      print "saving valid."
      os.system('./save-delta.sh')
    else:
      print "saving invalid, env file exists"

tryDeployment()