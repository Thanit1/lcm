(() => {
  'use strict'

  // Function to update the chart
  function updateChart(data) {
      const labels = data.map(item => item.timestamp);
      const usageData = data.map(item => item.usage);

      const ctx = document.getElementById('myChart');
      const myChart = new Chart(ctx, {
          type: 'line',
          data: {
              labels: labels,
              datasets: [{
                  data: usageData,
                  lineTension: 0,
                  backgroundColor: 'transparent',
                  borderColor: '#007bff',
                  borderWidth: 4,
                  pointBackgroundColor: '#007bff'
              }]
          },
          options: {
              plugins: {
                  legend: {
                      display: false
                  },
                  tooltip: {
                      boxPadding: 3
                  }
              }
          }
      });
  }

  // Handle form submission
  document.getElementById('tokenForm').addEventListener('submit', function (e) {
      e.preventDefault();
      
      const token = document.getElementById('token').value;
      const date = document.getElementById('date').value;
      
      // Perform an AJAX request to fetch the data
      fetch(`/fetch-data?token=${token}&date=${date}`)
          .then(response => response.json())
          .then(data => {
              updateChart(data);
              // Close the modal after fetching the data
              const modal = bootstrap.Modal.getInstance(document.getElementById('selectTokenModal'));
              modal.hide();
          })
          .catch(error => console.error('Error fetching data:', error));
  });

  // Automatically show the modal when the page loads
  window.onload = function () {
      const myModal = new bootstrap.Modal(document.getElementById('selectTokenModal'), {
          backdrop: 'static',
          keyboard: false
      });
      myModal.show();
  };
})();