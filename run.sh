#!/bin/sh

# Check if two arguments are provided (impl and option)
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <impl_file> <options>"
    exit 1
fi

current_datetime=$(date "+%Y-%m-%d-T%H-%M-%S")

# Assign the arguments to variables
impl_file="$1"
ompl_file="./results/$current_datetime-$(basename $impl_file)"

# Check if the input impl file exists
if [ ! -f "$impl_file" ]; then
    echo "Error: $impl_file does not exist."
    exit 1
fi

# Print the input string
echo "--manifest=$impl_file"
echo "--output=$ompl_file"

./install_models.sh

# Run the local model
# touch "$ompl_file"
yarn ie --manifest "${impl_file}" --output "${ompl_file}" 2>&1 | grep -v 'DeprecationWarning' | grep -v 'warning'

echo "[Output]"
# if [ $option = "local" ]; then
cat "$ompl_file" | grep -v 'DeprecationWarning' | grep -v 'Warning:'
# elif [ $option = "dev" ] || [ $option = "dev-no-install" ]; then
#     cat "../if/$ompl_file" | grep -v 'DeprecationWarning' | grep -v 'Warning:'
# fi

echo "[The output is saved in $ompl_file]"
printf "Done\n"