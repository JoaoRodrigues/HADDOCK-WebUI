from flask import jsonify, request
from app   import app

from form_common import Model

import os
import re
import json
import time


def handle_form_post(request, model):
    # Our return value (which should be JSON encoded) will be passed back to the client.

    #print request.form.keys()
    #print request.files

    if 'json' in request.form:
        try:
            data = json.loads(request.form['json'])
        except ValueError:
            return jsonify(success=False, message='Invalid POST format (no valid JSON).')

        try:
            if data['form_version'] != model.get_version_tag():
                return jsonify(
                    success=False,
                    message='The data model has changed since you loaded this form,'
                            ' please reload and try again.'
                )

            accesslevel_names = [ level['name'] for level in model.accesslevel_data ]

            # We cannot do much validation besides checking whether the user has
            # access to the supposedly submitted form level.
            #
            # TODO: Check with actual user access level.
            if data['level'] not in accesslevel_names or accesslevel_names.index(data['level']) > 999:
                return jsonify(
                    success=False,
                    message='The selected form level is too high,'
                            ' please request a higher access level or select a different level above.'
                )
        except KeyError:
            return jsonify(success=False, message='Submitted form data is incomplete (form metadata is missing).')

        # Validation and restrictions applied up to this point:
        #
        # *** client-side (unreliable)
        # - Required parameters are filled in
        # - Parameter datatypes are correct
        # - Components don't repeat more/less often than allowed
        # - The instances tree must match the model components tree
        # - Submitting a too high form level is not allowed
        #
        # *** server-side
        # - Submitted data is valid JSON
        # - The submitted form version number matches our up to date model
        # - The user has access to the submitted form access level
        #
        # If anything breaks beyond this point, it should be due to one of the following reasons:
        # - A system error occurred (e.g. disk full, no write permissions to the output directory, etc.)
        # - The CNS template used by CNSParser was changed after the model used during this POST was generated
        # - Client-side (HTML5) validation steps were not supported by the
        #   user's browser and the user failed to fill in valid data
        # - Client-side validation steps were bypassed by the user for whatever reason
        #
        # The four problems above will be catched by CNSParser.

        # TODO: How do we determine the output directory name?
        #       Use a timestamp for now.
        output_directory = app.config['OUTPUT_ROOT'] + '/' + 'job_' + str(int(time.time()))

        if not os.path.exists(app.config['OUTPUT_ROOT']):
            os.makedirs(app.config['OUTPUT_ROOT'])

        run_no = 1
        while os.path.exists(output_directory + '_' + str(run_no)):
            run_no += 1

        os.mkdir(output_directory)

        #print(json.dumps(data,
        #    sort_keys=True,
        #    indent=(4),
        #))

        # Allowing the client to set the paths/names of uploaded files would be
        # dangerous, we make this list ourselves.
        assert 'files' not in data
        data['files'] = [] # A list of submitted files with their component, instance and repetition numbers.
        # This information is appended to the form data struct.

        for name, file in request.files.iteritems():
            # Try to obtain component, instance and repetition numbers from the file's field name.
            match = re.search(r'file_c(?P<component>[0-9]+)_i(?P<instance>[0-9]+)_r(?P<repetition>[0-9]+)', name)
            if match:
                captures = match.groupdict()

                # NOTE: Do NOT allow any user input to be used in the filename as is.
                filename = (
                    # Convert to int and back just in case.
                    'file_c' + str(int(captures['component']))
                    + '_i'   + str(int(captures['instance']))
                    + '_r'   + str(int(captures['repetition']))
                )

                file.save(os.path.join(output_directory, filename))

                # Store file information in the formdata json.
                data['files'].append({
                    'name':       filename,
                    'component':  str(int(captures['component'])),
                    'instance':   str(int(captures['instance'])),
                    'repetition': str(int(captures['repetition'])),
                })

            else:
                # A file with an invalid field name was submitted, don't save it.
                # This shouldn't happen, so we can safely ignore it.
                pass

        with open(output_directory + '/' + 'formdata.json', 'w') as formdata_file:
            json.dump(data, formdata_file, indent=4)

        # TODO: Copy / link the template CNS to the job directory
        # TODO: Call jsontocns.py

        #return jsonify(success=False, message='Unimplemented.')
        #return jsonify(success=True, message='Done.')
        return jsonify(
            success=True,
            message='Form information stored in job directory "' + output_directory + '".\n'
                  + 'Please run jsontocns.py manually. (see the examples/ directory in your CNSParser repository)'
        )
    else:
        return jsonify(success=False, message='Invalid POST format.')
